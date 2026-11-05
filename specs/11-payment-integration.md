# 11 — Payment Integration (Stripe-style mock)

## 1. Purpose

Let a trainer add balance to their wallet through an external payment provider. The provider is a local Express mock that imitates the shape and behavior of Stripe's PaymentIntent API. It exists so the lab can practice:

- a single synchronous charge call with an idempotency key;
- ambiguous outcomes (timeout, or a successful charge whose response is lost);
- recovery of uncertain top-ups by a worker, without double-crediting the wallet.

The provider is not real money and does not contact Stripe. Stripe's model is used because it is widely known and its semantics are well documented.

## 2. Decisions

| Topic | Decision |
|---|---|
| Provider flow | One call that creates and confirms the charge (`capture_method = automatic`). No separate authorize/capture steps. |
| Provider model | PaymentIntent with `status`, `amount`, `currency`, `metadata`. |
| Idempotency key | `topUpId` (client-generated UUID) is the primary key of `top_ups` and is sent to the provider as the `Idempotency-Key` header. |
| Currency and unit | THB only. Public and internal APIs take integer baht. The provider receives integer satang (`amount × 100`), as Stripe does with minor units. |
| Amount limits | Integer from 1 to 10,000 THB. Out of range returns `400 VALIDATION_ERROR`. |
| Wallet credit | Happens only when the local top-up row moves to `COMPLETED`, in the same database transaction. |
| HTTP location | The provider call happens outside any database transaction, as with shipping. |
| Public header | Public top-up uses `topUpId` in the JSON body, like `purchaseId`. The `Idempotency-Key` header exists only on the provider call. |

## 3. Flow

1. Client calls `POST /api/wallet/top-ups` with `{ topUpId, amount }` and a bearer token.
2. PokéMart API validates the body and checks that `topUpId` does not exist yet.
3. Transaction 1: insert `top_ups` with `status = PENDING`, `provider_payment_id = NULL`. Commit.
4. Call the provider `POST /v1/payment_intents` with `Idempotency-Key: <topUpId>`, body `{ amount: <satang>, currency: "thb", confirm: true, metadata: { topUpId, userId } }`.
5. Outcomes:
   - **succeeded**: transaction 2 updates `top_ups` to `COMPLETED` with `provider_payment_id` and credits `user_wallet` by `amount`. Return `201` with `Location: /api/wallet/top-ups/{topUpId}`.
   - **declined** (provider returns a payment error such as `card_declined`): transaction 2 sets `FAILED`, no credit. Return `402 PAYMENT_FAILED`.
   - **HTTP 5xx, connection error, or timeout**: the charge outcome is unknown. Set `UNKNOWN` (conditional update, see section 5). No credit. Return `503 DEPENDENCY_UNAVAILABLE`.

Transaction 2 uses a conditional update, `WHERE top_up_id = ? AND status IN ('PENDING', 'UNKNOWN')`. If zero rows change, the top-up was already finalized by another process (for example, the recovery worker). Do not credit again in that case.

## 4. Data

`top_ups` table (new, numbered migration for existing volumes):

| Column | Notes |
|---|---|
| `top_up_id` | UUID, primary key. Client-generated. |
| `user_id` | FK to `users.user_id`. |
| `amount_baht` | Integer, 1–10,000. |
| `status` | `PENDING`, `COMPLETED`, `FAILED`, `UNKNOWN`. |
| `provider_payment_id` | Nullable. Set after `COMPLETED` or when the provider returns an id. |
| `last_error_code` | For example `card_declined`, `provider_timeout`. |
| `attempt_count` | Incremented by the recovery worker. |
| `next_attempt_at`, `claimed_until` | Same lease pattern as `shipments`. |
| `created_at`, `updated_at` | |

Index `(status, next_attempt_at)` and `(status, claimed_until)`.

Terminal states are `COMPLETED` and `FAILED`. A `FAILED` top-up is not retried under the same `topUpId`; the client creates a new one.

Wallet rule is unchanged: `balance` never goes negative and only changes through `COMPLETED` top-ups and purchases.

## 5. Recovery of UNKNOWN top-ups

The lab's recovery worker (same process type as the shipping worker) claims `UNKNOWN` and stale `PENDING` rows whose `next_attempt_at` is due.

For each claimed row, the worker calls `GET /v1/payment_intents/{id}`. Because the mock derives the provider id deterministically (`pi_` followed by `topUpId` with hyphens removed), the worker can query the provider even when the original response was lost. In real Stripe the worker would store the id from the create response or search by metadata; this is a lab simplification and is noted here.

Results:

- provider `succeeded`: finalize as `COMPLETED` and credit the wallet (same conditional update as section 3).
- provider `canceled` or payment error: finalize as `FAILED`, no credit.
- provider reports nothing (404): the charge was never created. Finalize as `FAILED`. This is safe only because the create call used the same deterministic id; if the provider could create a charge later under the same key, the worker must keep the row `UNKNOWN` instead. The mock does not do this, so the rule is documented but not tested in v1.
- provider unreachable: keep `UNKNOWN`, increment `attempt_count`, set `next_attempt_at` with backoff.

Maximum attempts is bounded (default 10). Rows that exhaust attempts stay `UNKNOWN` and are visible for inspection; they are not auto-credited or auto-failed.

Recovery must never credit a top-up twice: the conditional update in section 3 is the guard, and the worker uses it too.

## 6. Payment mock API

Base path: `/v1`. The mock is an Express service in Docker Compose, separate from PokéMart's database.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/payment_intents` | Create and confirm a charge. Requires `Idempotency-Key`. |
| `GET` | `/v1/payment_intents/{id}` | Read the current status of a charge. |
| `GET` | `/health` | Liveness. |
| `PUT` | `/__test/faults` | Test-only. Sets the next fault for a given `topUpId`. Not exposed through the BFF. |
| `DELETE` | `/__test/faults` | Test-only. Clears all faults and resets state. |

### Create

Request headers: `Authorization: Bearer <lab secret>`, `Idempotency-Key`, `Content-Type: application/json`.

```json
{ "amount": 50000, "currency": "thb", "confirm": true, "metadata": { "topUpId": "…", "userId": "…" } }
```

Responses:

- `200` with `{ "id": "pi_…", "object": "payment_intent", "status": "succeeded", "amount": 50000, "currency": "thb" }`. Replaying the same key and same body returns the same response with no second charge.
- `400` with `{ "error": { "type": "idempotency_error", "code": "key_reused_with_different_params" } }` if the key is reused with a different body.
- `402` with `{ "error": { "type": "card_error", "code": "card_declined" } }` for a declined charge. The intent is stored as `canceled`.
- `500` or a timeout when a fault is set (test only).

### Status values

`succeeded`, `canceled`, `processing`. The lab does not model `requires_action` (3-D Secure) in v1.

### Fault control (test only)

Set per `topUpId`, consumed on the next matching create call:

| Fault | Behavior |
|---|---|
| `http_500` | Return `500` without charging. Local state stays uncharged. |
| `timeout_before_charge` | Hold the request longer than the PokéMart timeout, then drop it. No charge. |
| `charged_response_lost` | Charge successfully, store `succeeded`, then close the connection without a response. This is the ambiguous case. |
| `decline` | Return `402 card_declined` without charging. |

Test cases must confirm the wallet and `top_ups` state after each fault, not only the HTTP response.

## 7. Public and internal APIs

Public (BFF):

- `POST /api/wallet/top-ups` body `{ "topUpId": "uuid", "amount": 500 }` with bearer token. Success `201`.
- `GET /api/wallet/top-ups/{topUpId}` owner-scoped. Malformed id `400 VALIDATION_ERROR`; missing or not owned `404 TOP_UP_NOT_FOUND`.

Public errors added:

| Code | HTTP | When |
|---|---|---|
| `TOP_UP_DUPLICATE` | 409 | `topUpId` already exists, any status. Client should call `GET`. |
| `PAYMENT_FAILED` | 402 | Provider declined; top-up is `FAILED`. |
| `TOP_UP_NOT_FOUND` | 404 | Unknown or not owned. |
| `DEPENDENCY_UNAVAILABLE` | 503 | Provider 5xx, timeout, or connection error. Top-up may be `UNKNOWN`. |

Internal (PokéMart): `POST /pokemart/v1/wallet/top-ups` and `GET /pokemart/v1/wallet/top-ups/{topUpId}`, same rules.

The BFF does not retry `POST /api/wallet/top-ups` automatically, same as purchases.

## 8. Acceptance criteria

- A successful top-up creates one `top_ups` row, one provider charge, and one wallet credit, all consistent.
- A declined charge leaves wallet unchanged and the row `FAILED`.
- A provider 500 or timeout before charge leaves the row `UNKNOWN`, wallet unchanged. Recovery finalizes it as `FAILED`.
- A charged-but-response-lost case leaves the row `UNKNOWN`, wallet unchanged. Recovery finds `succeeded` and credits exactly once.
- Running recovery twice, or recovery concurrently with a retry from the client, credits at most once.
- Re-sending the same `topUpId` after `COMPLETED` returns `409 TOP_UP_DUPLICATE` and does not change the balance.
- Replaying the provider create call with the same `Idempotency-Key` produces no second charge.
- The provider call is not inside a database transaction.
- The mock is not reachable through the public BFF, and fault routes are not published in `specs/openapi.yaml`.

## 9. Changes needed in existing documents

- `01-scope-and-architecture.md`: add Payment mock and top-up to in-scope; change "Real-money transactions" out-of-scope note to say no real money moves.
- `03-api-contract.md`: add the two `/api/wallet/top-ups` endpoints and the new error codes; update the wallet section to mention top-up.
- `03b-bff.md`: add rows for the BFF top-up endpoints and error mapping for `402` and `503`.
- `03c-pokemart-api.md`: add internal top-up endpoints and the transaction steps in section 3 above.
- `02-data.md`: add `top_ups` to logical tables and a numbered migration note.
- `05-operations.md`: add the payment mock to Compose services and `PAYMENT_*` environment variables; recovery worker sweep interval. (Done; the mock listens on `4004`, see `05-operations.md` §11.1.)
- `06-acceptance-and-decisions.md`: add the top-up acceptance criteria and the decisions in section 2.
- `specs/`: add `payment-mock-openapi.yaml` for the mock routes in section 6.
- `README.md`: add this document to the document table.

## 10. Open points

- Whether the mock should support `requires_action` (3-D Secure) in a later iteration.
- Top-up is not gated by KYC (decided; KYC gates item purchases only, see `12-kyc.md`).
