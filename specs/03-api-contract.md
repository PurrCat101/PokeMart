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
| `POST` | `/api/purchases` | Purchase a Pokémon using a client-generated purchase ID |
| `GET` | `/api/purchases` | List purchase history |
| `GET` | `/api/purchases/:id` | Get purchase details |
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
6. Stock ≥ quantity → otherwise `409 INSUFFICIENT_STOCK`.
7. Wallet balance ≥ unit price × quantity → otherwise `422 INSUFFICIENT_FUNDS`.

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
- The purchase row's primary key is the final duplicate guard. The purchase row and wallet, stock, and inventory changes commit atomically.

## 7.5 Purchase history

`GET /api/purchases` uses the same `limit` and `offset` rules as the catalog. Public pages use `totalCount`, `page`, and `items`; each item groups the `purchaseId`, Pokémon summary, and pricing. Results are ordered by `createdAt` descending, with the internal purchase ID as tie-breaker, so pages are stable.

`GET /api/purchases/:id` returns `404 PURCHASE_NOT_FOUND` for an unknown ID and `400 VALIDATION_ERROR` for a malformed ID.

## 7.6 Wallet and inventory

- `GET /api/wallet` returns the BFF wallet resource containing `userId` and integer `balance`.
- `GET /api/inventory` returns one item per owned species with a nested Pokémon summary and `quantity`. An empty inventory returns an empty `items` array. Inventory is not paginated in this iteration.

## Note on test coverage of 7.4

Purchase-ID retry and duplicate behavior has a dedicated test group in `04-testing.md`.
