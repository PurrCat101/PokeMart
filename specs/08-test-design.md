# 08 — Public API Test Design

## 1. Scope and sources

This design covers the public BFF contract in [`openapi.yaml`](./openapi.yaml), with business rules from [`03-api-contract.md`](./03-api-contract.md) and BFF behavior from [`03b-bff.md`](./03b-bff.md). The internal service contract in [`pokemart-openapi.yaml`](./pokemart-openapi.yaml) is not directly exercised by these Playwright projects.

The WireMock project replaces the BFF and checks configured public response fixtures. It does not execute BFF validation, upstream error mapping, or PokéMart API business logic. The `X-WireMock-Scenario` header selects a fixture; it is test control, not a public API input.

Test configuration comes from `TEST_ENV` and `tests/configs/.env.<environment>`. State-mutating cases require an isolated test database and run with one worker. Tests snapshot and restore wallet, stock, and inventory, and delete purchases they create.

Case IDs in this document provide stable traceability; existing automation titles keep their current IDs and are linked in the automation-reference column.

## 2. Endpoint inventory

| ID | Method and path | Purpose / inputs | Success response | Documented error responses | State / dependencies |
|---|---|---|---|---|---|
| CAT-01 | `GET /api/pokemon` | List active listings; optional `limit` (1–100, default 20), `offset` (>=0, default 0) | 200 `PokemonPage` (`totalCount`, `page`, `items`) | 400 validation or unknown query; 503 dependency | Catalog read |
| CAT-02 | `GET /api/pokemon/{id}` | Read a listed Pokémon; positive integer path ID | 200 `Pokemon` (`pokemon`, `listing`) | 400 invalid ID; 404 `POKEMON_NOT_FOUND`; 503 dependency | Catalog read |
| WAL-01 | `GET /api/wallet` | Read the configured development user's wallet | 200 `Wallet` | 404 `USER_NOT_FOUND`; 503 dependency | Wallet read; fixed development identity |
| INV-01 | `GET /api/inventory` | Read owned Pokémon | 200 `Inventory` (`items`) | 503 dependency | Inventory read |
| PUR-01 | `GET /api/purchases` | Purchase history; same paging rules as catalog | 200 `PurchasePage` | 400 validation or unknown query; 503 dependency | Purchase history read |
| PUR-02 | `POST /api/purchases` | JSON `{ purchaseId, pokemonId, quantity }`; UUID, positive integer, quantity 1–99 | 201 `Purchase`; `Location` identifies created resource | 400 validation/invalid JSON; 404 `POKEMON_NOT_FOUND`; 409 duplicate/not-for-sale/stock; 415 unsupported media; 422 insufficient funds; 503 dependency | Atomic purchase, wallet, stock, inventory, history |
| PUR-03 | `GET /api/purchases/{id}` | Read purchase by UUID | 200 `Purchase` | 400 invalid UUID; 404 `PURCHASE_NOT_FOUND`; 503 dependency | Purchase history read |
| SYS-01 | `GET /health` | Liveness; no parameters | 200 `{ status: "ok" }` | None documented | No dependency |
| SYS-02 | `GET /ready` | Readiness check | 200 when upstream is ready | 503 when upstream is unavailable | Calls PokéMart API `/ready` |

The public BFF maps internal response DTOs: catalog pages use `totalCount/page/items`, inventory items nest `pokemon`, and purchase responses expose `purchaseId` and grouped `pricing`. Tests assert these public shapes rather than internal DTO names.

## 3. Business E2E flows

| Case ID | Preconditions and ordered API calls | Final assertions / cleanup | Automation reference |
|---|---|---|---|
| E2E-BRW-001 | Read `GET /api/pokemon`, then `GET /api/wallet` as configured user | Catalog is non-empty and paginated; wallet is the configured user; public DTO does not expose internal `results` shape | `tests/testCases/e2e/browse-wallet.spec.ts` |
| E2E-PUR-001 | Snapshot DB; read catalog detail, wallet, inventory; `POST /api/purchases` for quantity 1; read purchase detail, history, wallet, inventory, and catalog again | 201 plus `Location`; exact public purchase DTO; wallet decreases by price, stock decreases by one, inventory increases by one, history/detail agree; restore state and delete purchase | `tests/testCases/purchases/lifecycle.spec.ts` |
| E2E-PUR-002 | Snapshot DB; submit an invalid Pokémon using a fresh `purchaseId`; retry that same ID with a valid Pokémon; submit again after commit; read detail | First attempt does not reserve ID; retry succeeds; committed duplicate returns 409; persisted purchase and one-time side effects verified; restore and delete | `tests/testCases/purchases/retry.spec.ts` |
| E2E-PUR-003 | Snapshot DB; concurrently submit the same valid purchase ID twice | Exactly one 201 and one 409 `PURCHASE_DUPLICATE`; only one purchase and one set of side effects; restore and delete | `tests/testCases/purchases/concurrency.spec.ts` |
| PUR-BIZ-001 | Submit purchase for a nonexistent Pokémon | 404 `POKEMON_NOT_FOUND`; no purchase or unintended mutation | `tests/testCases/purchases/business-errors.spec.ts` |
| PUR-BIZ-002 | Set listing inactive, submit purchase | 409 `POKEMON_NOT_FOR_SALE`; no purchase or wallet/stock/inventory mutation; restore listing and state | Same |
| PUR-BIZ-003 | Set stock to zero, submit purchase | 409 `INSUFFICIENT_STOCK`; no purchase or unintended mutation; restore state | Same |
| PUR-BIZ-004 | Set wallet balance to zero, submit purchase | 422 `INSUFFICIENT_FUNDS`; no purchase or unintended mutation; restore state | Same |

## 4. Validation matrix

| Input / behavior | Partitions and representative cases | Test references |
|---|---|---|
| Pokémon path ID | Existing positive integer; malformed string, zero, negative, decimal; valid but nonexistent ID | `CAT-API-004`, `CAT-VAL-PATH`, `CAT-ERR-404` |
| Purchase path ID | Valid UUID (including supported UUID versions); malformed UUID; valid, nonexistent UUID | `PUR-API-READ-003`, `PUR-API-PATH` |
| Pagination | Omitted defaults; minimum and maximum limit; interior value; below/above range; negative, decimal, alphabetic, empty, whitespace, duplicate; offset zero and beyond available results; unknown parameter | `CAT-API-001`–`003`, `CAT-API-002`, `CAT-VAL-001`–`012`, `PUR-API-READ-003`–`006`, `PUR-VAL-PAGE-001` |
| Request ID | Valid ID echoed; absent or malformed ID replaced with generated valid ID; echoed on success and exact error responses | `SYS-API-001`–`002`, exact error helper used by API tests |
| Development identity | Client-supplied `X-User-Id` cannot override configured identity | `SYS-API-003` |
| Purchase body properties | Missing, null, malformed UUID; missing/null/string/non-positive/decimal Pokémon ID; missing/null/string/zero/negative/decimal/too-large quantity; unknown field; non-object JSON | `PUR-VAL-001`–`017` |
| Purchase body syntax/media | Malformed JSON versus syntactically valid non-object JSON; unsupported content type | `PUR-VAL-017`–`019` |
| Resource/state | Pokémon missing, listing inactive, stock insufficient, wallet insufficient, committed duplicate, retry after failed transaction, concurrent duplicate | `PUR-API-PATH`, `PUR-BIZ-001`–`004`, `E2E-PUR-002`–`003` |
| Responses and side effects | Exact error envelope (status, content type, request ID, code, message, details); closed public DTOs; success headers; no state mutation on rejected purchases; subsequent reads reflect committed state | `expectPublicError`, catalog/read/validation suites, `E2E-PUR-001`–`003` |

`X-Request-Id` is a correlation header, not an idempotency key. A purchase retry reuses the body `purchaseId`; no `Idempotency-Key` header is used. The test suite does not require authentication because this lab uses a fixed development user.

## 5. Equivalence partitions and boundaries

| Field | Valid partition / boundaries | Invalid partitions | Evidence |
|---|---|---|---|
| Catalog/history `limit` | Default 20; min 1; max 100; representative interior 2 and 99 | 0, 101, negative, decimal, nonnumeric, empty, whitespace, repeated | Catalog `CAT-API-001`–`002`, `CAT-VAL-001`–`008`; history `PUR-API-READ-003`–`006`, `PUR-VAL-PAGE-001` |
| Catalog/history `offset` | Default 0; min 0; beyond last result returns an empty page | Negative, decimal, empty, repeated | `CAT-API-001`, `CAT-API-003`, `CAT-VAL-009`–`011`; `PUR-API-READ-004`, `PUR-VAL-PAGE-001` |
| `pokemonId` body | Positive integer; known ID is successful control | Missing, null, string, zero, decimal; well-formed nonexistent value | `PUR-VAL-004`–`008`, `PUR-BIZ-001` |
| `quantity` | Integer 1 (successful purchase control) through maximum 99 | Missing, null, string, zero, negative, decimal, 100 | `PUR-VAL-009`–`015`, `PUR-API-001`, `E2E-PUR-001` |
| `purchaseId` body/path | UUID accepted; committed ID is duplicate; failed ID is reusable | Missing, null, malformed UUID; valid but nonexistent path UUID | `PUR-VAL-001`–`003`, `PUR-API-PATH`, `E2E-PUR-002` |
| Pokémon path `id` | Existing positive integer | Alphabetic, zero, negative, decimal; positive nonexistent integer | `CAT-VAL-PATH`, `CAT-ERR-404` |

There is no documented maximum for Pokémon IDs, so no artificial upper-bound test is asserted. A non-existent positive integer tests resource existence separately from format validation.

## 6. Error-code coverage matrix

“Real API” means the test calls the real BFF and PokéMart API. “WireMock fixture” means the configured public response was selected with `X-WireMock-Scenario`; it does not prove that real BFF logic maps that failure correctly.

| Endpoint | Trigger | HTTP / code | Case reference | Status |
|---|---|---|---|---|
| `GET /api/pokemon` | Invalid pagination | 400 `VALIDATION_ERROR` | `CAT-VAL-001`–`011` | Covered — real API |
| `GET /api/pokemon` | Unknown query | 400 `UNKNOWN_QUERY_PARAMETER` | `CAT-VAL-012`, `MOCK-ERR-002` | Covered — real API and fixture |
| `GET /api/pokemon` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |
| `GET /api/pokemon/{id}` | Malformed ID | 400 `VALIDATION_ERROR` | `CAT-VAL-PATH` | Covered — real API |
| `GET /api/pokemon/{id}` | Valid nonexistent ID | 404 `POKEMON_NOT_FOUND` | `CAT-ERR-404`, `MOCK-ERR-006` | Covered — real API and fixture |
| `GET /api/pokemon/{id}` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |
| `GET /api/wallet` | Configured user missing | 404 `USER_NOT_FOUND` | `MOCK-ERR-007` | Fixture only; real missing-user case not run |
| `GET /api/wallet` | Upstream unavailable / unexpected BFF failure | 503 `DEPENDENCY_UNAVAILABLE` / 500 `INTERNAL_ERROR` | `MOCK-END-004`, `MOCK-ERR-015` | Fixtures only; real failure mapping not run |
| `GET /api/inventory` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |
| `GET /api/purchases` | Invalid pagination | 400 `VALIDATION_ERROR` | `PUR-VAL-PAGE-001` | Covered — real API |
| `GET /api/purchases` | Unknown query | 400 `UNKNOWN_QUERY_PARAMETER` | `PUR-API-READ-005`, `MOCK-ERR-002` | Covered — real API and fixture |
| `GET /api/purchases` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |
| `POST /api/purchases` | Invalid properties or non-object JSON | 400 `VALIDATION_ERROR` | `PUR-VAL-001`–`017`, `MOCK-ERR-001`, `MOCK-ERR-005` | Covered — real API and fixture |
| `POST /api/purchases` | Malformed JSON | 400 `INVALID_JSON` | `PUR-VAL-018`, `MOCK-ERR-003` | Covered — real API and fixture |
| `POST /api/purchases` | Pokémon missing | 404 `POKEMON_NOT_FOUND` | `PUR-BIZ-001`, `E2E-PUR-002`, `MOCK-ERR-009` | Covered — real API and fixture |
| `POST /api/purchases` | Already committed purchase ID | 409 `PURCHASE_DUPLICATE` | `E2E-PUR-002`–`003`, `MOCK-ERR-013` | Covered — real API and fixture |
| `POST /api/purchases` | Listing inactive | 409 `POKEMON_NOT_FOR_SALE` | `PUR-BIZ-002`, `MOCK-ERR-010` | Covered — real API and fixture |
| `POST /api/purchases` | Insufficient stock | 409 `INSUFFICIENT_STOCK` | `PUR-BIZ-003`, `PUR-API-001`, `MOCK-ERR-011` | Covered — real API and fixture |
| `POST /api/purchases` | Insufficient funds | 422 `INSUFFICIENT_FUNDS` | `PUR-BIZ-004`, `MOCK-ERR-012` | Covered — real API and fixture |
| `POST /api/purchases` | Unsupported content type | 415 `UNSUPPORTED_MEDIA_TYPE` | `PUR-VAL-019`, `MOCK-ERR-004` | Covered — real API and fixture |
| `POST /api/purchases` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |
| `GET /api/purchases/{id}` | Malformed UUID | 400 `VALIDATION_ERROR` | `PUR-API-PATH` | Covered — real API |
| `GET /api/purchases/{id}` | Valid but nonexistent UUID | 404 `PURCHASE_NOT_FOUND` | `PUR-API-PATH`, `MOCK-ERR-008` | Covered — real API and fixture |
| `GET /api/purchases/{id}` | Upstream unavailable | 503 `DEPENDENCY_UNAVAILABLE` | `MOCK-END-004` | Fixture covered; real failure mapping not run |

Additional BFF-generated codes are `DEPENDENCY_UNAVAILABLE` and `INTERNAL_ERROR`; their fixture responses are checked exactly. The readiness 503 is intentionally a health-check body (`status/checks`), not the public API error envelope.

### WireMock case identifiers

The aggregate tests in `tests/testCases/mocked-bff/contract.spec.ts` map scenario rows to `MOCK-ERR-001`–`015` in the matrix order below: catalog validation, unknown query, malformed JSON, unsupported media, non-object JSON, catalog Pokémon not found, user not found, purchase not found, Pokémon missing during purchase, not for sale, insufficient stock, insufficient funds, committed duplicate, dependency unavailable, internal error. The endpoint fixtures are checked by `tests/testCases/mocked-bff/endpoints.spec.ts`: `MOCK-END-001` success responses, `MOCK-END-002` empty responses, `MOCK-END-003` readiness failure, and `MOCK-END-004` dependency failure on every public business route.

## 7. Detailed case expectations

| Case group | Preconditions / request | Expected response | Side effects / cleanup | Priority |
|---|---|---|---|---|
| Catalog success and pagination | Seed has 151 active Pokémon; request defaults, limits 1/2/99/100, and an offset beyond total | 200; exact public DTO structure; default page 20/0; stable ascending IDs; empty `items` beyond total | Read-only | P1 |
| Catalog invalid input | Vary only one pagination value or path ID per request; send request ID | Exact 400 or 404 envelope including `details` | No state changes; read-only | P1 |
| Purchase body validation | Snapshot wallet, stock, inventory, and chosen purchase ID; submit each single-invalid-field case | Exact 400 envelope and request ID | State snapshot unchanged; close DB connection | P1 |
| Purchase JSON/media validation | Snapshot state; send raw malformed JSON or non-JSON content type; separately send valid JSON primitive `null` | `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, or `VALIDATION_ERROR` respectively | State snapshot unchanged; close DB connection | P1 |
| Purchase business rejection | Snapshot state and set only the target condition (missing Pokémon, inactive listing, zero stock, zero balance) | Exact status/code/message/details; no purchase committed | Restore state in `finally`; close DB connection | P1 |
| Purchase commit and duplicate | Snapshot initial state; POST valid body; inspect detail/history/wallet/inventory/catalog; POST committed ID again | 201 with `Location`; exact public DTO; one commit; duplicate 409 | Restore state and remove created purchase in `finally` | P1 |
| Concurrent duplicate | Same purchase ID and request sent concurrently | Exactly `[201, 409]`; duplicate error exact; one stored row and one set of changes | Restore state and remove created purchase in `finally` | P1 |
| Correlation / identity | Supply valid, missing, malformed request IDs and client `X-User-Id` | Echo or generate valid request ID; configured identity is returned | Read-only | P1 |
| Mocked contract response | Call route with scenario selector and representative request, including JSON/media cases | Exact fixture status, content type, request ID, full envelope/body | No real BFF or database involved | P2 |

## 8. Traceability, execution, and gaps

### Executed results

| Track | Executed command | Result |
|---|---|---|
| WireMock public fixtures | `npm run test:mocked` | 13 passed |
| Real BFF/API validation and reads | `npm run test:api` | 52 passed |
| Real purchase/E2E journeys | `npm run test:e2e` | 8 passed |
| All Playwright projects | `npm test` | 73 passed |
| TypeScript test type-check | `npx tsc -p tests/tsconfig.json --noEmit` | Passed |
| Application build | `npm run build` | Passed |

The full suite passed after the final code changes. These results do not establish coverage for routes or upstream failure modes not exercised by these projects.

### Open items and contract gaps

1. **Public OpenAPI does not enumerate the error codes per operation.** It declares status responses and a generic `code: string`; the mapping above is corroborated from business/BFF documents and executable tests, but the public OpenAPI alone cannot generate the error matrix.
2. **Public error schema is less strict than the implementation/documentation.** `details` is not required in `openapi.yaml` and its item schema is unspecified, although BFF responses always include it and `03-api-contract.md` describes it as part of the envelope.
3. **Correlation response header is not declared on every public OpenAPI response.** `03-api-contract.md` and `03b-bff.md` require `X-Request-Id` on every response; current tests validate representative success/error responses.
4. **Real upstream-failure mapping is not executed.** WireMock fixtures prove only the fixtures' response bodies. No isolated fault-injection profile currently demonstrates connection refusal, timeout, upstream 5xx, malformed upstream payload, or the BFF's 500 behavior.
5. **User-not-found is fixture-only.** The configured test identity has a wallet; a real missing-user test needs a safe test identity/data setup.
6. **Internal PokéMart API routes are not directly tested by these Playwright projects.** The suite exercises the public BFF and end-to-end behavior; internal API contract verification is a separate scope.
7. **No shared-service shutdown is performed for fault tests.** Tests must not stop the API container when using a shared environment; add a test-only fault injection or dedicated isolated stack before claiming this coverage.

### Coverage summary

All nine public BFF route/method combinations have at least one exact success response assertion in the WireMock suite, and every one of the 13 public error codes used by the current BFF/service error contracts is represented by an exact fixture assertion. Real API validation, read behavior, purchase business errors, commit/retry/duplicate/concurrency, and state restoration are exercised by the current test runs. The mock track's 503/500 results are fixture coverage only. Do not describe this as complete upstream fault-mapping or internal PokéMart API coverage until the open items above are resolved.
