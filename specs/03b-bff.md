# 03b — BFF (Backend-for-Frontend)

This file describes what the BFF does. The public HTTP contract (paths, parameters, schemas, status codes) is in `specs/openapi.yaml`. When this file and the OpenAPI file disagree on a public detail, the OpenAPI file wins and this file must be updated.

## 1. Role

The BFF is the only public entry point for the lab. Clients and tests call the BFF, never the PokéMart API directly, for business journeys.

The BFF:
- validates request shape and public constraints before forwarding (path, query, headers, body);
- forwards each request to the PokéMart API with the correlation header and request body;
- maps upstream responses and errors to the public contract;
- exposes its own `/health` and `/ready` endpoints.

The BFF does not:
- contain business rules (stock, wallet, purchase eligibility). Those live in the PokéMart API;
- access MySQL directly;
- decide whether a purchase is allowed. The PokéMart API owns purchase state and duplicate detection.

Validation is intentionally duplicated in the BFF and the PokéMart API. The BFF rejects bad input early with a clear public error. The PokéMart API still validates everything, because it may be called by something other than the BFF later.

## 2. Upstream dependency

The BFF calls one upstream: the PokéMart API, at `POKEMART_API_BASE_URL`.

Upstream paths use the service contract prefix `/pokemart/v2`. The PokéMart API is not a public entry point. Its contract is in `specs/pokemart-openapi.yaml` and described in `03c-pokemart-api.md`. Clients must not call it directly for business journeys.

## 3. Endpoints

| Method | Path | Upstream call | Success | Possible public errors |
|---|---|---|---|---|
| `GET` | `/api/pokemon` | `GET /pokemart/v2/catalog/pokemon` with same `limit`, `offset` | `200` | `400 VALIDATION_ERROR`, `400 UNKNOWN_QUERY_PARAMETER`, `503` |
| `GET` | `/api/pokemon/:id` | `GET /pokemart/v2/catalog/pokemon/{id}` | `200` | `400`, `404 POKEMON_NOT_FOUND`, `503` |
| `GET` | `/api/wallet` | `GET /pokemart/v2/wallet` | `200` | `503` |
| `GET` | `/api/inventory` | `GET /pokemart/v2/inventory` | `200` | `503` |
| `POST` | `/api/purchases` | `POST /pokemart/v2/purchases` with body containing `purchaseId` | `201` | `400`, `404`, `409`, `415`, `422`, `503` |
| `GET` | `/api/purchases` | `GET /pokemart/v2/purchases` with `limit`, `offset` | `200` | `400`, `503` |
| `GET` | `/api/purchases/:id` | `GET /pokemart/v2/purchases/{id}` | `200` | `400`, `404 PURCHASE_NOT_FOUND`, `503` |
| `GET` | `/health` | none | `200` | none |
| `GET` | `/ready` | `GET /ready` on PokéMart API | `200` or `503` | none |

The BFF and PokéMart API paths differ on purpose. The BFF is the public contract; `/pokemart/v2` is the service contract. The mapping above is part of this spec and must be kept in sync with `specs/pokemart-openapi.yaml`.

### Endpoint notes

- **`GET /api/pokemon`**: the BFF checks `limit` and `offset` against the public rules (1–100 and 0 or more). It forwards only the validated values. It does not add or change results.
- **`GET /api/pokemon/:id`**: the BFF checks that `id` is a positive integer before calling upstream. This is the only place where a malformed ID returns a `400` without an upstream call.
- **`POST /api/purchases`**: the BFF requires a valid UUID `purchaseId` in the JSON body and forwards the body and `X-Request-Id`. It does not retry POST requests automatically.
- **`GET /api/wallet`** and **`GET /api/inventory`**: no business logic. Pure pass-through with error mapping.
- **`/health`**: answers without calling any dependency. If the process can answer, this returns `200`.
- **`/ready`**: returns `200` only if the PokéMart API `/ready` returns `200`. Otherwise returns `503` with `checks.pokemartApi: "unavailable"`.

## 4. Headers

| Header | Direction | Rule |
|---|---|---|
| `X-Request-Id` | client to BFF | Echo if valid (1–64 chars, `A-Za-z0-9_-`). Otherwise generate. |
| `X-Request-Id` | BFF to PokéMart API | Always sent, same value as the BFF response. |
| `Location` | PokéMart API to BFF to client | Forwarded unchanged on `201`. |
| `X-Request-Id` | every response | Always present, including errors and health checks. |

## 5. Development user identity

Authentication is replaced by a fixed development user, `lab-user-001`. The BFF adds the user identity to every upstream call as the `X-User-Id` header. The client does not send it, and the BFF overwrites any `X-User-Id` sent by the client. This is a learning simplification and not a security design.

The identity is set using `LAB_USER_ID` so that replacing it with real authentication later changes one module.

The BFF owns the public response DTOs and maps internal service responses rather than returning them directly. Public catalog pages use `totalCount`, `page`, and `items`; purchase responses use a `purchaseId`, nested Pokémon summary, and grouped pricing. The internal service contract remains independent.

## 6. Error mapping

The BFF always returns the public error envelope:

```json
{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [] } }
```

Rules:

1. **Upstream returned a 4xx with a known error code.** Pass the status and code through unchanged.
2. **Upstream returned a 4xx with an unknown code, or a malformed body.** Keep the same HTTP status if it is a public status for that endpoint, and map the code to the closest public code. If no sensible mapping exists, return `500 INTERNAL_ERROR` and log the upstream details. The client never sees raw upstream bodies.
3. **Upstream returned a 5xx.** Return `503 DEPENDENCY_UNAVAILABLE` with message `Catalog service is temporarily unavailable` or the equivalent for the endpoint. Log the upstream status.
4. **Upstream connection refused, DNS failure, or timeout.** Return `503 DEPENDENCY_UNAVAILABLE`.
5. **Unexpected error inside the BFF.** Return `500 INTERNAL_ERROR` with no internal details.

Public error codes the BFF may produce itself (not from upstream): `VALIDATION_ERROR`, `UNKNOWN_QUERY_PARAMETER`, `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.

Note: `502 Bad Gateway` is deliberately not used in the public contract. Clients get `503` for any upstream failure, so the contract stays small.

## 7. Timeouts and retries

- Every upstream call has a timeout. Initial value: 3 seconds for reads and 5 seconds for `POST /api/purchases`. Values live in configuration, not in code.
- The BFF retries **reads** (`GET`) at most once, and only on connection errors or timeouts.
- The BFF **never retries `POST /api/purchases` automatically**. Retrying is the client's decision, using the same `purchaseId` from the request body. If the original purchase committed, the retry gets `409 PURCHASE_DUPLICATE`; if it did not commit, it can proceed normally.
- A timeout on `POST /api/purchases` returns `503`. The client may retry with the same ID, and should use `GET /api/purchases/{purchaseId}` to inspect an uncertain result.

## 8. Logging

Each request produces one access log line from the BFF with: timestamp, service name, environment, request ID, method, route template (for example `/api/pokemon/:id`, never the raw path), status code, and duration. Upstream calls produce one log line each with the upstream status and duration.

Do not log: headers other than the ones listed in section 4, or request bodies that contain no useful information.

## 9. Health and readiness

- `/health` (liveness): no dependency calls. Used to detect a stuck process.
- `/ready` (readiness): checks the PokéMart API. Used to decide whether to send traffic. Responses are not cached.

## 10. Testing relationship

- The **mocked track** (Track A) replaces the BFF with WireMock. The mappings must reproduce sections 3, 4, and 6 of this file, so the mock matches the real BFF's behavior.
- The **real track** (Track B) tests the real BFF with the real PokéMart API. Error mapping (section 6) is tested here, using a controlled upstream failure (for example, stopping the PokéMart API container in a dedicated test, or a fault-injection setting in a test-only build). Do not stop shared services during ordinary tests.
- The mocked track cannot prove that the BFF maps errors correctly. Report it separately, as `04-testing.md` section 8.3 requires.

## 11. Open points for the BFF

- ~~Exact upstream paths~~ Decided: upstream paths use the `/pokemart/v2` prefix (section 2 and section 3).
- Whether `GET /api/inventory` and `GET /api/wallet` should be combined into one dashboard endpoint later. Not in this iteration.
- Whether the BFF should expose metrics separately from the PokéMart API, once the observability phase starts (`05-operations.md`).
