# Progress tracker

Last updated: 2026-10-17

## Done

- [x] Created the npm workspace, TypeScript configuration, and two Express services.
- [x] Implemented BFF routes under `/api`, request-ID propagation, input validation, upstream timeout/retry behavior, JWT forwarding, response DTO mapping, and dependency error mapping.
- [x] Implemented PokéMart service catalog, wallet, inventory, purchase history, and transactional purchase updates with client-generated purchase IDs and duplicate detection.
- [x] Added MySQL schema, constraints, indexes, and deterministic Generation I seed data; retired idempotency-key storage.
- [x] Added `users`, password hashes, user foreign keys, demo login, and one-hour HS256 bearer authentication for user-owned API resources.
- [x] Added Docker Compose (MySQL, BFF, PokéMart API, WireMock, Swagger UI), Dockerfiles, environment template, and Make targets.
- [x] Added distinct public and service OpenAPI contracts, Swagger UI selection, and WireMock success/error mappings.
- [x] Documented PokeAPI snapshot, deterministic pricing/stock rules, auth setup, user identity migration, and destructive database-reset warning.
- [x] Updated purchase flow to use a client-generated UUID `purchaseId` in the request body, with retry-after-rollback and `409 PURCHASE_DUPLICATE` after commit.
- [x] Removed idempotency-key storage and documented the existing-volume migration that drops the retired table.
- [x] Added a real retry/duplicate test that restores its wallet, stock, inventory, and purchase data after execution.
- [x] Kept WireMock, real API validation, purchase, and E2E scenarios in separate Playwright test folders; `TEST_ENV` selects environment configuration without changing test cases.

## In progress / validation needed

- [x] Installed pinned dependencies, generated `package-lock.json`, and compiled TypeScript successfully.
- [x] Started Compose and verified health/readiness, a 151-record catalog, and distinct BFF/service response DTOs.
- [x] Re-ran the separated Playwright suites after adding `TEST_ENV=test|sit`: 9 WireMock tests, 6 API tests, 1 purchase-retry test, 2 E2E tests, and 17 tests in the full run passed.
- [x] Recreated and verified Swagger UI: its same-origin `http://localhost:8081/openapi.yaml` endpoint returns HTTP 200.
- [x] Added local Swagger-to-BFF CORS support, including the `OPTIONS` preflight used by Swagger UI’s Try it out requests.
- [x] Reorganized Playwright into its own `tests/` workspace with `testCases`, `support`, `resources`, and environment `configs`.
- [x] Added mocked WireMock coverage for all BFF endpoints and every documented public error code.
- [x] Validated renamed identity and expanded reference data against the local MySQL volume; removed the stale legacy player wallet and dropped the retired idempotency table.
- [ ] Expand the real-system Playwright suite into the full coverage matrix: purchase concurrency, persistence, and all endpoint boundary cases.

## Validation notes

- The workstation already used host port `3306`; local `.env` sets `MYSQL_HOST_PORT=3307`. Container-to-container MySQL still uses `3306`.
- `npm install` reported one high-severity transitive vulnerability. It was not auto-fixed because the suggested command uses a potentially breaking forced upgrade; review it deliberately with `npm audit`.
- Build passed; focused and full test runs passed with the separated suite layout.
- The real purchase-retry test confirms failed ID reuse, duplicate detection after commit, and exactly one wallet/stock change, then restores test data.

## Deferred by the specification

- [x] Reorganized tests into separate target/purpose folders rather than sharing scenarios across WireMock and real targets.
- [ ] Confirm current PokeAPI license/attribution requirements before redistributing the checked-in snapshot.
- [ ] Optional observability stack and k6 performance scripts.
