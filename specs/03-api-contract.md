# 03 — API Contract

The formal contract is `specs/openapi.yaml`. This file describes behavior and rules that the OpenAPI document references. Define each endpoint in OpenAPI before implementing it.

## Conventions

- Base path: `/api`. Health endpoints are `/health` and `/ready`.
- Every response includes `X-Request-Id`. A valid incoming ID is echoed; otherwise the BFF generates one.
- Errors use one envelope: `{ "error": { "code", "message", "requestId", "details" } }`. Codes are stable and machine-readable.
- Unknown query parameters on GET endpoints return `400 UNKNOWN_QUERY_PARAMETER`.
- Request bodies must be `application/json`; otherwise `415 UNSUPPORTED_MEDIA_TYPE`.
- `POST /api/auth/login` verifies the seeded demo account and returns a one-hour HS256 bearer token. `GET /api/auth/me` returns the token's active user profile. No registration, password reset, refresh token, or production-grade rate limiting is included.
- Catalog reads are public. Wallet, inventory, and purchase endpoints require `Authorization: Bearer <accessToken>`; the API derives `user_id` from the validated token and ignores client-supplied `X-User-Id`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Exchange email/password for an access token |
| `GET` | `/api/auth/me` | Return the current token's user profile |
| `GET` | `/api/pokemon` | List catalog Pokémon with pagination |
| `GET` | `/api/pokemon/:id` | Get Pokémon reference details and shop listing |
| `GET` | `/api/wallet` | Get the lab user's wallet |
| `GET` | `/api/inventory` | Get Pokémon owned by the lab user |
| `POST` | `/api/purchases` | Purchase a Pokémon (`pokemonId`) or an item (`itemId`, never both) using a client-generated purchase ID |
| `POST` | `/api/checkouts` | Buy a whole bag (1–20 lines) atomically under a client-generated `checkoutId` (idempotency key and order id): every line commits, or nothing changes |
| `GET` | `/api/purchases` | List purchase history of both kinds, newest first; optional `kind=POKEMON` or `kind=ITEM` |
| `GET` | `/api/purchases/:id` | Get purchase details (either kind) |
| `GET` | `/api/purchases/:id/shipment` | Get the authenticated user's local shipping status (either kind) |
| `GET` | `/api/items/inventory` | Get items owned by the lab user |
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (includes PokéMart API check) |

The local seeded demo account is `lab-user-001@example.test` / `PokeMartLab!2026`. Treat these credentials and the default JWT signing secret as local practice values only. A frontend stores the `accessToken` and sends it in the `Authorization` header; it should discard the token when signing out.

## 7.1 Catalog pagination

`GET /api/pokemon` supports `limit` and `offset`:

- `limit`: optional integer; default `20`; minimum `1`; maximum `100`.
- `offset`: optional integer; default `0`; minimum `0`.
- Invalid values such as `limit=0`, `limit=101`, `limit=abc`, `limit=1.5`, or `offset=-1` return `400 VALIDATION_ERROR`.
- Ordering is stable: ascending Pokémon source ID.
- A response never contains more than `limit` results.
- `totalCount` is the total number of catalog records matching the query before pagination.
- The public BFF response uses `page: { limit, offset }` and `items`, with Pokémon details and shop listing grouped separately.
- An offset beyond the end returns an empty `items` array with `200`.
- The catalog contains Pokémon that have an active shop listing.

Example (values illustrative; actual values must match the lab snapshot and seed data):

```json
{
  "totalCount": 151,
  "page": { "limit": 20, "offset": 0 },
  "items": [
    {
      "pokemon": { "id": 1, "name": "bulbasaur", "types": ["grass", "poison"], "spriteUrl": "..." },
      "listing": { "price": 300, "availableStock": 23 }
    }
  ]
}
```

## 7.2 Pokémon detail

`GET /api/pokemon/:id` uses the PokéAPI numeric source ID consistently.

- Known ID with a listing: `200` with the same `pokemon` and `listing` shape as a catalog item.
- Unknown ID, or ID without a listing: `404 POKEMON_NOT_FOUND`.
- Invalid ID format (not a positive integer): `400 VALIDATION_ERROR`.

## 7.3 Purchase workflow

`POST /api/purchases` with body:

```json
{ "purchaseId": "00000000-0000-4000-8000-000000000001", "pokemonId": 1, "quantity": 1 }
```

Validation and business rules, checked in this order:

1. Body is valid JSON and contains `purchaseId`, `pokemonId`, and `quantity` → otherwise `400 VALIDATION_ERROR` (or `400 INVALID_JSON` for malformed JSON).
2. `purchaseId` is a UUID, `pokemonId` is a positive integer, and `quantity` is an integer from 1 to 99 → otherwise `400 VALIDATION_ERROR`.
3. A committed purchase with the same `purchaseId` already exists → `409 PURCHASE_DUPLICATE`.
4. Pokémon exists in the catalog → otherwise `404 POKEMON_NOT_FOUND`.
5. Pokémon has an active shop listing → otherwise `409 POKEMON_NOT_FOR_SALE`.
6. The caller's account is not under identity review → otherwise `403 KYC_PENDING_REVIEW` (applies to every listing, including Pokémon). Then the caller's KYC level satisfies the listing's `required_kyc_level` (1 for every Pokémon and ordinary item, 2 for the Master tier; level 0 buys nothing) → otherwise `403 KYC_LEVEL_REQUIRED`. See [`12-kyc.md`](12-kyc.md) §6.
7. Stock ≥ quantity → otherwise `409 INSUFFICIENT_STOCK`.
8. Wallet balance ≥ unit price × quantity → otherwise `422 INSUFFICIENT_FUNDS`.

One endpoint buys either kind of product: the body is `{ purchaseId, quantity }` plus exactly one of `pokemonId` or `itemId`. Sending both returns `400 VALIDATION_ERROR` (field `body`), and sending neither reports the missing `pokemonId`. A request with `itemId` follows the same order with `ITEM_NOT_FOUND` and `ITEM_NOT_FOR_SALE` in place of the Pokémon codes (the duplicate code is always `PURCHASE_DUPLICATE`), and a real KYC check. Either kind creates a `PENDING` shipment in the same transaction. Both kinds are read back with the same `GET /api/purchases/{id}`.

A purchase response carries `purchaseId`, `kind` (`POKEMON` or `ITEM`), `pokemon` or `item` (`{ id, name }`, only the one that applies), `quantity`, `pricing` (`unitPrice`, `totalPrice`) and `createdAt`. `GET /api/purchases` uses the same shape in `items`, accepts `limit`, `offset` and `kind` (any other value of `kind` returns `400 VALIDATION_ERROR`), and an unknown query parameter returns `400 UNKNOWN_QUERY_PARAMETER`.

Effects of a successful purchase, all in one database transaction:

- Insert the purchase record using the client-provided `purchaseId`.
- Decrease shop stock by `quantity`.
- Decrease wallet balance by `unitPrice × quantity`.
- Increase inventory quantity for the Pokémon.

A failed purchase leaves wallet, stock, inventory, and purchase history unchanged. Its `purchaseId` is not reserved and can be retried.

Success returns `201 Created` with a `Location` header pointing to `/api/purchases/{id}`.

## 7.4 Purchase ID and retries

The client generates a UUID `purchaseId` before sending `POST /api/purchases`. It sends the ID in the JSON body alongside `pokemonId` and `quantity`; no `Idempotency-Key` header is used.

- Reuse the same ID only when retrying the same purchase attempt.
- Generate a new ID for each new purchase intent.
- A failure before the purchase transaction commits does not reserve the ID. The same ID can be retried, including after a timeout or dependency error; the client should first check `GET /api/purchases/{purchaseId}` when the result is uncertain.
- When a purchase with that ID has committed, another POST using it returns `409 PURCHASE_DUPLICATE`, even if the body differs. Use `GET /api/purchases/{purchaseId}` to inspect the completed purchase.
- Pokémon and item purchases share one `purchases` table and one endpoint, so a committed `purchaseId` is a duplicate whichever product the second request names (`409 PURCHASE_DUPLICATE`). Clients should generate a fresh UUID per purchase attempt regardless of kind.
- The purchase row's primary key is the final duplicate guard. The purchase row and wallet, stock, and inventory changes commit atomically.
- Reference client behavior (the web app, [`09-frontend.md`](09-frontend.md)): it keeps one `purchaseId` per bag line (and quantity) after an uncertain result (`5xx`, timeout, lost connection) and re-sends it on the next try. A `409 PURCHASE_DUPLICATE` on such a retry is not shown as a failure: the client reads the order with `GET /api/purchases/{purchaseId}` and treats it as the committed purchase. A clear `4xx` rejection frees the ID.


### 7.4.1 Checkout (a whole bag) and its idempotency

`POST /api/checkouts` buys a bag in one request. Body: `{ checkoutId, lines }`, where `checkoutId` is a client-generated UUID and `lines` has 1 to 20 entries, each `{ quantity }` plus exactly one of `pokemonId` or `itemId`. A product may appear once; lines carry no `purchaseId` (the server creates one purchase per line). Success is `201` with `{ checkoutId, purchases: [...] }`; every purchase has its own shipment, and the purchases are tagged with the `checkoutId`. The tag is returned as `checkoutId` on each purchase of the bag, in the checkout response and in `GET /api/purchases` and `GET /api/purchases/{id}`; purchases made through `POST /api/purchases` have no `checkoutId` field, so clients can group history into orders by it.

**All or nothing.** Every line is checked and written in one transaction, so a rejected bag changes nothing (no stock, wallet, inventory, purchase or shipment). Checks run one phase at a time over the whole bag, in the same priority as a single purchase: product exists (`404`), product for sale (`409`), verification (`403`), stock (`409`), then the wallet against the **bag total** (`422`). Within a phase the first failing line in request order decides the error, so the result never depends on the order of the lines. Line-specific errors carry `details: [{ "field": "lines[i]", "message": "..." }]`; validation fields are prefixed `lines[i].`.

**The `checkoutId` is the idempotency key.** The client keeps it after an uncertain result (`5xx`, timeout, lost connection) and sends the same id with the same bag on the next try.

| Request | Result |
|---|---|
| Same `checkoutId`, same user, same bag (line order does not matter) after the first one committed | `201` with the stored first response, same purchase ids, header `Idempotent-Replayed: true`. Nothing is written or charged again. |
| Same `checkoutId` with a different bag, or an id that belongs to another user | `409 CHECKOUT_ID_CONFLICT`. Nothing changes. |
| Two identical requests at the same time | One commits. The other waits for it, then gets the same replay (`201` plus `Idempotent-Replayed: true`). |
| Same `checkoutId` after a rejection (`4xx`) or a failure before commit | Processed as a new attempt. A rejected checkout leaves no record, so the id is free until a checkout commits under it. |

The checkout row and everything it bought commit together, so a replay only ever returns a committed result. **Retention.** A `checkouts` row is the order record for the purchases it bought (`purchases.checkout_id` references it), so it is kept for as long as those purchases are; there is no expiry and a replay works at any later time. The table grows at the same rate as `purchases` (one small row per committed bag), so it needs no separate clean-up job in this lab. A production system that expires idempotency keys (commonly after 24 hours to 30 days) would need to stop treating the row as the order record first, for example by dropping `response_json` and the foreign key, and that is deliberately not done here.

`POST /api/purchases` is unchanged and keeps its own `purchaseId` rules (section 7.4).

## 7.5 Purchase history

`GET /api/purchases` uses the same `limit` and `offset` rules as the catalog. Public pages use `totalCount`, `page`, and `items`; each item groups the `purchaseId`, Pokémon summary, and pricing. Results are ordered by `createdAt` descending, with the internal purchase ID as tie-breaker, so pages are stable.

`GET /api/purchases/:id` returns `404 PURCHASE_NOT_FOUND` for an unknown ID and `400 VALIDATION_ERROR` for a malformed ID.

## 7.6 Wallet and inventory

- `GET /api/wallet` returns the BFF wallet resource containing `userId` and integer `balance`.
- `GET /api/inventory` returns one item per owned species with a nested Pokémon summary and `quantity`. An empty inventory returns an empty `items` array. Inventory is not paginated in this iteration.

## Note on test coverage of 7.4

Purchase-ID retry and duplicate behavior has a dedicated test group in `04-testing.md`.


## 7.7 Shipment status

`GET /api/purchases/{purchaseId}/shipment` (same behavior and response for Pokémon and item purchases) requires bearer authentication and returns the locally persisted shipment state. It does not proxy to the shipping provider, so it remains available during provider outages. A valid purchase may be committed while `processingStatus` is `PENDING`, `RETRY_WAIT`, or `UNKNOWN` and `deliveryStatus` is `WAITING_FOR_SHIPMENT`; shipping failure does not mean the purchase failed. The response keeps `orderStatus`, `processingStatus`, and `deliveryStatus` separate so operational retry state cannot be mistaken for delivery progress. The lookup is scoped to the authenticated user's purchase and must not disclose another user's records. Malformed UUID returns `400 VALIDATION_ERROR`; missing or non-owned purchase returns `404 PURCHASE_NOT_FOUND`. Response schema and state transitions are defined in [`10-shipping-integration.md`](10-shipping-integration.md).
