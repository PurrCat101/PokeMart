# 03c — PokéMart API (service contract)

The PokéMart API owns all shop business rules, transactions, duplicate-purchase detection, and MySQL access. It is called by the BFF. It is not a public entry point, and clients must not call it directly for business journeys.

The formal contract is `specs/pokemart-openapi.yaml`. This file describes the rules behind it.

## 1. Path prefix and versioning

- All business endpoints use the prefix `/pokemart/v1`.
- The version segment changes only for breaking changes to request or response shape, status codes, or error codes.
- Health endpoints `/health` and `/ready` are not versioned.

## 2. Authentication and caller identity

Catalog reads are public. `POST /pokemart/v1/auth/login` verifies a user's email/password against the stored scrypt hash and returns a one-hour HS256 access token. `GET /pokemart/v1/auth/me`, wallet, inventory, and purchase operations require `Authorization: Bearer <accessToken>`.

The API validates the signature, algorithm, issuer, audience, issue/expiry times, and the active user row on every protected request. It takes `user_id` from the verified JWT `sub` claim; it does not trust `X-User-Id`. Missing, malformed, expired, invalid, or inactive-user tokens return `401 UNAUTHORIZED`. Incorrect login credentials return the generic `401 INVALID_CREDENTIALS`.

The BFF forwards tokens unchanged. The internal API is still intended to remain private to the trusted service network; production deployment also needs service-to-service restrictions, TLS, secret management, login rate limiting, and token revocation/refresh design.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/pokemart/v1/auth/login` | Verify credentials and issue a bearer access token |
| `GET` | `/pokemart/v1/auth/me` | Return the active authenticated profile |
| `GET` | `/pokemart/v1/catalog/pokemon` | Paged catalog of listed Pokémon |
| `GET` | `/pokemart/v1/catalog/pokemon/{id}` | One Pokémon with its listing |
| `GET` | `/pokemart/v1/wallet` | Wallet of the caller |
| `GET` | `/pokemart/v1/inventory` | Owned Pokémon of the caller |
| `POST` | `/pokemart/v1/purchases` | Create a purchase using the supplied purchase ID |
| `GET` | `/pokemart/v1/purchases` | Paged purchase history of the caller |
| `GET` | `/pokemart/v1/purchases/{id}` | One purchase of the caller |
| `GET` | `/pokemart/v1/purchases/{id}/shipment` | Local shipment state for the caller's purchase |
| `GET` | `/health` | Liveness, no dependency checks |
| `GET` | `/ready` | Readiness: MySQL reachable and schema initialized |

## 4. Behavior

Behavior rules are the same as the public contract in `03-api-contract.md`, with these differences:

- Pagination (`limit`, `offset`), ordering, and `count` rules are identical to the public contract.
- Purchase validation order, duplicate error, and retry rules (`03-api-contract.md` 7.3 and 7.4) apply exactly. The BFF forwards them without change.
- Unknown query parameters return `400 UNKNOWN_QUERY_PARAMETER`, the same as the BFF.
- The PokéMart API is the only layer that decides whether a purchase is allowed. The BFF's validation is a convenience and is not relied on.

## 5. Transactions

Each purchase runs in a single database transaction with the following steps. If any step fails, the transaction rolls back.

1. Lock the listing row for the Pokémon (`SELECT ... FOR UPDATE`). This serializes competing purchases of the same stock.
2. Check for an existing purchase ID before business constraints, then check listing, stock, and wallet balance.
3. Insert the purchase row.
4. Decrement stock and wallet balance.
5. Upsert the inventory row for the Pokémon, adding `quantity`.
6. Commit the purchase ID with all corresponding balance, stock, and inventory changes.

The client-generated `purchaseId` is the primary key of the purchase row. A retry after a transaction rollback can reuse that ID; once committed, it cannot be processed again and returns `409 PURCHASE_DUPLICATE`. Primary-key collisions are mapped to the same error, including concurrent requests.

## 6. Error handling

- The error envelope is the same as the public contract: `{ "error": { "code", "message", "requestId", "details" } }`.
- The PokéMart API reuses the `X-Request-Id` it receives from the BFF. If the header is missing, it generates one.
- Unexpected exceptions return `500 INTERNAL_ERROR` and are logged with full detail. The response contains no stack trace or SQL text.
- Database unavailable during a request returns `503 DEPENDENCY_UNAVAILABLE`.

## 7. Readiness

`/ready` returns `200` only when:
- a trivial query against MySQL succeeds, and
- the `shop_listing` and `users` tables exist and contain baseline rows (guards against running against an uninitialized or unmigrated volume).

Otherwise it returns `503` with `checks.mysql` set to `"unavailable"` or `"uninitialized"`.

## 8. Logging and metrics

Same rules as `05-operations.md` section 12. In addition, the PokéMart API logs the transaction outcome of each purchase (committed, rolled back, duplicate) with the request ID, never with the user ID in a metric label.

## 9. Testing relationship

- API validation tests for this service run against `specs/pokemart-openapi.yaml` directly, including the internal token-validation boundary.
- The public BFF tests must not be replaced by these tests. Report them separately, as `04-testing.md` section 8.3 requires.
- Concurrency tests for stock (two purchases competing for the last unit) run against this service and through the BFF. Only one of them may succeed.
- Direct internal service automation lives under `tests/testCases/PokeAPI/<endpoint>/` and runs with the Playwright project `pokeapi` (`npm run test:pokeapi` / `make test-pokeapi`).
- The endpoint directories cover login/current-user, catalog list/detail, wallet, inventory, purchase create/list/detail, retry/concurrency, health, and readiness. State-changing tests snapshot and restore the dedicated test database.
- Direct-service concurrency verifies both same-ID duplicate processing and distinct purchases competing for the last stock unit.
- Before a real Playwright project runs, `tests/testCases/setup/real-state.setup.ts` restores the configured test user's wallet and selected listing (price, stock, active) to the configured baseline and deletes that user's inventory row for that Pokémon. Purchase history and the database volume are preserved; use only a dedicated test database and user.
- Latest verified execution: `npm run test:pokeapi` passed all 21 internal API cases; the full `npm test` run passed 94 cases across WireMock, BFF API, E2E, and internal API projects.
- The current suite does not inject MySQL outages, uninitialized database state, or unexpected service exceptions; their 503/500 responses remain open fault-injection coverage.

## 10. Open points

- Whether `/ready` should also check the migration version once migrations exist.
- Whether purchase rows should store the listing's price at purchase time as a separate snapshot (the current design stores `unitPrice` on the purchase, which covers this).


## 11. Shipping integration

The PokéMart API creates a `PENDING` shipment record in the same transaction as a successful purchase. It does not call the provider in the purchase request path. A separate worker reads due shipment rows and calls the configured HTTP provider. Provider outages must not roll back a purchase or make the API liveness endpoint fail. The owner-scoped `GET /pokemart/v1/purchases/{id}/shipment` reads only MySQL and remains usable while Shipping is down. See [`10-shipping-integration.md`](10-shipping-integration.md) for retry, batch, idempotency, and recovery behavior.
