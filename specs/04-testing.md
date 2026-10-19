# 04 — Testing

## 8. Automation framework requirements

- Tests express the scenario and expected result clearly.
- Use OOP when it improves encapsulation or reuse; do not make every helper a class.
- Keep important assertions visible in the test body.
- Avoid hidden cross-test dependencies.
- Tests must be independently runnable and safe to repeat. Before a real-system project, setup restores the configured test user's wallet and selected Pokémon listing to the configured baseline, then clears that user's inventory row for that Pokémon. It does not reset purchase history or the database volume.
- Keep URLs and credentials out of test cases.
- Align fixtures, naming, folder structure, and conventions with the team's Playwright project once supplied.

Potential reusable components, subject to team conventions: API clients, Playwright fixtures, payload factories, domain assertions, WireMock helpers, UUID purchase-ID generators, and cleanup utilities. Use Playwright's `APIRequestContext` and fixtures where appropriate. Prefer uniquely identifiable test data and explicit cleanup over shared mutable data.

Coverage categories: happy paths, required-field and type validation, boundaries, pagination, not-found and conflict behavior, purchase-ID retries and duplicate detection, response schema and status, database persistence, transaction atomicity, dependency failures, WireMock request verification, and concurrency.

## 8.1 Functional test strategy: E2E flows and API validation

The functional suite has separate WireMock and real-system cases; no scenario file is shared between targets. `TEST_ENV` selects the environment configuration (`test` by default, or `sit`) while Playwright projects select which test suite to run.

Test files are organized by purpose:

- `tests/testCases/mocked-bff/`: WireMock-specific request/response contracts and mapping scenarios.
- `tests/testCases/pokemon/` and `tests/testCases/purchases/validation.spec.ts`: real BFF API validation.
- `tests/testCases/purchases/retry.spec.ts` and `tests/testCases/e2e/`: real-system purchase and E2E flows.
- `tests/testCases/PokeAPI/<endpoint>/`: internal PokéMart API contract tests, organized by endpoint and run directly against `POKEMART_API_BASE_URL`.

`tests/configs/.env.test` and `.env.sit` hold environment-specific URLs and test data. The fixture supplies target-specific user, Pokémon, page size, purchase ID, and mock scenario headers without sharing test files.

### A. API and business scenarios

WireMock and real-system scenarios are separately maintained. WireMock cases verify configured mock responses and mock mapping coverage; real-system cases verify public behavior and, where relevant, database side effects.

Initial flows:

1. Browse the catalog with pagination, select a Pokémon, purchase it, then verify wallet balance, inventory, and purchase history.
2. Attempt a purchase with insufficient funds; verify the expected error and confirm wallet, stock, inventory, and purchase history are unchanged.
3. Attempt to purchase more than available stock; verify the expected error and no partial database changes.
4. Retrieve a purchase by ID after a successful purchase and compare it with the creation response and persisted state.
5. Retry a failed, uncommitted purchase with the same `purchaseId`; verify the retry can succeed. Retry after success and verify `409 PURCHASE_DUPLICATE` with no second state change.

Scenario principles:
- Keep target-specific test files in their respective folders.
- Use environment configuration for URLs and test data rather than hard-coding environment-specific values in cases.
- Keep each test independent; real purchase tests clean up records and restore their dedicated baseline data.

### B. API specification and validation tests

Endpoint-level tests validate each contract directly and systematically, derived from `specs/openapi.yaml`.

Coverage includes:
- Required and optional fields, data types, formats, and unknown fields according to the documented policy.
- HTTP method and path behavior, content type, status code, response schema, and error schema.
- Query and path parameter validation, including `limit`/`offset` boundaries and stable pagination.
- Equivalence partitions and boundary values for purchase quantities, IDs, and other constrained fields.
- Not-found and conflict behavior.
- Purchase-ID retry and duplicate behavior (see group C below).
- Side effects where the endpoint changes state; failed operations must not leave unintended changes.
- Keep WireMock mapping-contract tests separate from real BFF API validation tests.

Tags distinguish `e2e` and `purchase-flow`; Playwright projects distinguish `wiremock`, `api`, `pokeapi`, and `e2e`. Run the direct internal-service suite with `npm run test:pokeapi` or `make test-pokeapi`.
The `e2e` project explicitly excludes `PokeAPI` paths so endpoint-specific internal cases cannot be selected by the broader real-purchase filename patterns.

### D. Internal PokéMart API suite

The `pokeapi` project checks `specs/pokemart-openapi.yaml` directly, without going through the BFF. Endpoint test files live in `tests/testCases/PokeAPI/<endpoint>/`:

- `catalog/list` and `catalog/detail`: internal catalog DTO, pagination, malformed IDs, unknown query parameters, missing identity, and not-found behavior.
- `auth`: valid login/token/profile and rejected credentials/tokens. `wallet/get` and `inventory/get`: authenticated user identity, wallet-not-found, empty inventory, and internal response shapes.
- `purchases/create`, `list`, and `detail`: request validation, content type, business errors, purchase history, tenant-scoped reads, and internal DTOs.
- `purchases/retry` and `purchases/concurrency`: retry after rollback, same-ID concurrent duplicate, and two distinct IDs competing for the last stock unit.
- `health/get` and `ready/get`: process liveness and readiness with initialized MySQL.

State-changing tests use unique purchase UUIDs, snapshot/restore wallet, stock, and inventory, and delete test purchases in cleanup. Only a dedicated test database may be used. Database-failure and unexpected-service-error responses require isolated fault injection and are not claimed as covered.
The shared setup project runs before `api`, `e2e`, and `pokeapi` projects, including when a single real project is selected. It does not run for WireMock-only tests. Configure `REAL_WALLET_BALANCE`, `REAL_POKEMON_PRICE`, and `REAL_POKEMON_STOCK` as the desired baseline, and point real tests at an isolated test database and user.

### C. Purchase-ID retry test group

Minimum set for the behavior in `03-api-contract.md` 7.4:

- A failed attempt that created no purchase row, retried with the same ID after correcting the request → succeeds.
- Same committed ID sent again → `409 PURCHASE_DUPLICATE`; wallet, stock, inventory, and purchase history remain unchanged by the duplicate attempt.
- A duplicate ID with a changed request body still returns `409 PURCHASE_DUPLICATE`.
- Missing or malformed `purchaseId` → `400 VALIDATION_ERROR`.
- Concurrent requests with the same ID → at most one committed purchase; a repeated request receives a duplicate error. Verify the database afterwards.
- A timeout or dependency failure where no purchase committed → retry with the same ID may succeed. If the commit outcome is uncertain, look up the purchase ID before retrying.

## 8.2 Test-data strategy and repeatability

Use separate categories of data:

1. **Reference data:** versioned Pokémon data from a pinned `PokeAPI/api-data` snapshot. Read-only during tests.
2. **Baseline business data:** deterministic catalog prices and stock, and a known development user and wallet, inserted by SQL seed scripts. Ordinary tests must not mutate these rows.
3. **Test-owned data:** real-target records use unique purchase UUIDs and are cleaned up. WireMock may use a configured fixed ID matching its static stub data.
4. **Performance dataset:** a larger, deliberately prepared dataset created by a separate setup command. Do not use ad hoc data generated during the measured load interval.

Requirements:
- Schema creation and baseline seed are version-controlled and repeatable on a fresh database volume.
- A documented reset or reseed operation exists and clearly warns that local data will be destroyed.
- Functional tests must not depend on run order or on another test having created data.
- Use a separate database or explicitly isolated environment for performance runs where practical. Do not run destructive resets during an active test.
- Record the dataset version, size, and seed procedure for every performance run.

## 9. WireMock strategy

### WireMock as a BFF contract target

Configure mappings for:
- successful catalog responses and pagination;
- invalid query parameters;
- Pokémon not found and not for sale;
- successful purchase (`201` with `Location`);
- purchase business-rule errors (insufficient stock, insufficient funds);
- purchase-ID duplicate (`409 PURCHASE_DUPLICATE`);
- server errors (`500`/`503`) and malformed responses where relevant.

Match method, path, query parameters, and body where the scenario requires it. Reset scenarios and request journals between tests for isolation.

### External dependencies

The initial application must not depend on live PokéAPI calls during each request or test. If a later exercise introduces a remote dependency, use WireMock to simulate its success, error, timeout, and malformed-response behavior. Do not mock the real PokéMart API in the real integration path.

## 8.3 Reporting rule

WireMock fixture, public BFF, direct internal PokéMart API, and end-to-end results are reported separately. A passing mocked contract test does not prove that the real BFF, internal service, database, or persistence effects behave the same way. A direct internal API pass does not prove the BFF's upstream error mapping.


## 9. Shipping integration and resilience suite

Shipping scenarios run against the real BFF and PokéMart API with the Express Shipping Mock as the external provider. They are not WireMock mocked-BFF tests. Assert public API behavior, MySQL shipment state, and provider request journal where appropriate. The required cases, including HTTP 500, 429, timeout, ambiguous timeout/idempotency, batch processing, max attempts, worker restart, lease recovery, and owner scoping, are listed in [`10-shipping-integration.md`](10-shipping-integration.md).

Do not assert that purchase creation fails when Shipping is unavailable: in the asynchronous design, the purchase should commit and shipment work should remain durable. Poll shipment status with a bounded timeout instead of fixed sleeps. Use a dedicated test database and reset mock state between tests.
