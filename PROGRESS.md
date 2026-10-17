# Progress tracker

Last updated: 2026-10-17

## Done

- [x] Created the npm workspace, TypeScript configuration, and two Express services.
- [x] Implemented BFF routes under `/api`, request-ID propagation, input validation, upstream timeout/retry behavior, fixed development user identity, response DTO mapping, and dependency error mapping.
- [x] Implemented PokéMart service catalog, wallet, inventory, purchase history, and transactional purchase updates with client-generated purchase IDs and duplicate detection.
- [x] Added MySQL schema, constraints, indexes, and deterministic Generation I seed data; retired idempotency-key storage.
- [x] Added Docker Compose (MySQL, BFF, PokéMart API, WireMock, Swagger UI), Dockerfiles, environment template, and Make targets.
- [x] Added distinct public and service OpenAPI contracts, Swagger UI selection, and WireMock success/error mappings.
- [x] Documented PokeAPI snapshot, deterministic pricing/stock rules, user identity migration, and destructive database-reset warning.
- [x] Updated purchase flow to use a client-generated UUID `purchaseId` in the request body, with retry-after-rollback and `409 PURCHASE_DUPLICATE` after commit.
- [x] Removed idempotency-key storage and documented the existing-volume migration that drops the retired table.
- [x] Added a real retry/duplicate test that restores its wallet, stock, inventory, and purchase data after execution.

## In progress / validation needed

- [x] Installed pinned dependencies, generated `package-lock.json`, and compiled TypeScript successfully.
- [x] Started Compose and verified health/readiness, a 151-record catalog, and distinct BFF/service response DTOs.
- [x] Ran the starter Playwright suite successfully: 5 tests passed across mocked-contract, API-validation, and real-integration projects.
- [x] Recreated and verified Swagger UI: its same-origin `http://localhost:8081/openapi.yaml` endpoint returns HTTP 200.
- [x] Added local Swagger-to-BFF CORS support, including the `OPTIONS` preflight used by Swagger UI’s Try it out requests.
- [x] Reorganized Playwright into its own `tests/` workspace with `testCases`, `support`, `resources`, and environment `configs`.
- [x] Added mocked WireMock coverage for all BFF endpoints and every documented public error code.
- [x] Validated renamed identity and expanded reference data against the local MySQL volume; removed the stale legacy player wallet and dropped the retired idempotency table.
- [ ] Expand the real-system Playwright suite into the full coverage matrix: purchase concurrency, persistence, and all endpoint boundary cases.

## Validation notes

- The workstation already used host port `3306`; local `.env` sets `MYSQL_HOST_PORT=3307`. Container-to-container MySQL still uses `3306`.
- `npm install` reported one high-severity transitive vulnerability. It was not auto-fixed because the suggested command uses a potentially breaking forced upgrade; review it deliberately with `npm audit`.
- `npm run build` and full `npm test` pass (9 tests); focused mocked contract (3), API validation (4), and purchase retry (1) runs also pass.
- The retry test confirms failed ID reuse, duplicate detection after commit, and exactly one wallet/stock change, then restores test data.
- Existing Playwright coverage includes mocked BFF endpoint/error contract checks, real pagination/query validation, real BFF browse flow, purchase-ID validation, and a retry/duplicate purchase flow. Remaining real-system scenarios are tracked above rather than being presented as complete coverage.

## Deferred by the specification

- [ ] Confirm the team’s existing Playwright structure before finalizing test folder/fixture conventions.
- [ ] Confirm current PokeAPI license/attribution requirements before redistributing the checked-in snapshot.
- [ ] Optional observability stack and k6 performance scripts.
