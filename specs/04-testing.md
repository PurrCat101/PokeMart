# 04 — Testing

## 8. Automation framework requirements

- Tests express the scenario and expected result clearly.
- Use OOP when it improves encapsulation or reuse; do not make every helper a class.
- Keep important assertions visible in the test body.
- Avoid hidden cross-test dependencies.
- Tests must be independently runnable and safe to repeat.
- Keep URLs and credentials out of test cases.
- Align fixtures, naming, folder structure, and conventions with the team's Playwright project once supplied.

Potential reusable components, subject to team conventions: API clients, Playwright fixtures, payload factories, domain assertions, WireMock helpers, UUID purchase-ID generators, and cleanup utilities. Use Playwright's `APIRequestContext` and fixtures where appropriate. Prefer uniquely identifiable test data and explicit cleanup over shared mutable data.

Coverage categories: happy paths, required-field and type validation, boundaries, pagination, not-found and conflict behavior, purchase-ID retries and duplicate detection, response schema and status, database persistence, transaction atomicity, dependency failures, WireMock request verification, and concurrency.

## 8.1 Functional test strategy: E2E flows and API validation

The functional suite has two clearly identified layers. They serve different purposes and must not be collapsed into one large set of tests.

### A. End-to-end (E2E) business flows

E2E tests validate a complete business journey through the public BFF API and real application services. They assert both the response and important persisted side effects.

Initial flows:

1. Browse the catalog with pagination, select a Pokémon, purchase it, then verify wallet balance, inventory, and purchase history.
2. Attempt a purchase with insufficient funds; verify the expected error and confirm wallet, stock, inventory, and purchase history are unchanged.
3. Attempt to purchase more than available stock; verify the expected error and no partial database changes.
4. Retrieve a purchase by ID after a successful purchase and compare it with the creation response and persisted state.
5. Retry a failed, uncommitted purchase with the same `purchaseId`; verify the retry can succeed. Retry after success and verify `409 PURCHASE_DUPLICATE` with no second state change.

E2E principles:
- Send requests through the BFF entry point; do not bypass the BFF for a business journey.
- Use the real BFF, PokéMart API, and MySQL. WireMock may replace only a dependency outside the system boundary.
- Keep each test independent; clean up records it creates, or use a disposable or resettable dataset.
- Assert business outcomes and state changes, not internal implementation details.
- Keep exhaustive field and query validation at the endpoint level for speed and clearer diagnostics.

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
- BFF contract tests against WireMock before the BFF exists, followed by tests against the real BFF.

Tag or project names must distinguish `e2e`, `api-validation`, `contract-mocked`, `integration`, and `purchase-retry`. Exact folder and tag syntax follows the team's Playwright conventions.

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
3. **Test-owned data:** records created by an individual test, identified uniquely and cleaned up when appropriate. Purchase IDs created by tests must use unique UUIDs.
4. **Performance dataset:** a larger, deliberately prepared dataset created by a separate setup command. Do not use ad hoc data generated during the measured load interval.

Requirements:
- Schema creation and baseline seed are version-controlled and repeatable on a fresh database volume.
- A documented reset or reseed operation exists and clearly warns that local data will be destroyed.
- Functional tests must not depend on run order or on another test having created data.
- Use a separate database or explicitly isolated environment for performance runs where practical. Do not run destructive resets during an active test.
- Record the dataset version, size, and seed procedure for every performance run.

## 9. WireMock strategy

### WireMock as a temporary BFF

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

Mocked-BFF results and real-system results are reported separately. A passing mocked contract test does not prove that the real BFF behaves the same way.
