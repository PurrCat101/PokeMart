# 06 — Acceptance Criteria and Decisions

## 16. Acceptance criteria

### Reference data
- The data source, selected generation, and snapshot retrieval date are documented.
- Tests do not need a live network call to PokéAPI.
- Pokémon IDs and names match the 151-record Generation I snapshot.
- Shop price and stock are clearly identified as lab-owned data.

### API contract
- `specs/openapi.yaml` documents all endpoints, including `purchaseId` in the `POST /api/purchases` body.
- `GET /api/pokemon` defines `limit` (default 20, range 1–100) and `offset` (default 0, minimum 0).
- Invalid pagination values return the documented client error.
- Ordering is stable and responses never contain more than `limit` results.
- Purchase rules, side effects, and purchase-ID retry behavior are documented before implementation.

### Purchase ID and retry behavior
- A missing or malformed `purchaseId` returns `400`.
- A failed, uncommitted purchase does not reserve its ID; retrying with the same ID can succeed.
- A committed ID sent again returns `409 PURCHASE_DUPLICATE`, and wallet/stock/inventory do not change again.
- Concurrent requests with the same ID create at most one purchase.
- A 5xx or dependency failure where no purchase committed allows retry with the same ID; an uncertain outcome can be checked using `GET /api/purchases/{purchaseId}`.

### Database and application
- A fresh database volume initializes successfully.
- The seeded demo account can log in and receive a signed, one-hour access token; invalid credentials, missing/invalid tokens, and inactive users are rejected.
- Wallet, inventory, and purchase operations derive identity from a verified token; client-supplied `X-User-Id` cannot select another user's records.
- Catalog reads remain accessible without authentication.
- Required tables, keys, constraints (including the unique primary key on `purchases.id`), and indexes exist; new volumes do not create `idempotency_keys`.
- User-owned tables reference `users.user_id` with declared foreign keys.
- Baseline seed records exist after initialization and are not duplicated on restart.
- Successful purchases update all related state consistently.
- Failed purchases do not leave partial changes.
- Tests do not depend on execution order or accidentally mutate baseline data.

### Automation
- Playwright cases are kept in separate WireMock, API-validation, purchase, and E2E suites; test files are not shared across targets.
- Real-target purchase cases exercise the BFF, PokéMart API, MySQL, and persisted side effects.
- WireMock-only mapping-integrity tests verify mock setup and mock-specific response scenarios.
- Assertions are readable and failures are diagnosable.
- Test structure follows the team's Playwright conventions once supplied.

### Functional test strategy
- Separate WireMock and real-system suites cover the contract and behavior relevant to each target; mock and real results are not presented as equivalent coverage.
- The purchase-retry test verifies retry and duplicate behavior against the real service and checks persistence side effects.
- `TEST_ENV=test|sit` selects environment URLs and test data without changing suite structure or test cases.
- Test data is deterministic, isolated, repeatable, and independent of execution order.

### Observability and performance readiness
- Services expose documented health and readiness endpoints.
- Structured logs contain request IDs and request duration without leaking secrets.
- The architecture documents metrics to expose and can add Prometheus and Grafana without redesigning application APIs.
- Optional observability services do not block ordinary functional tests.
- A future k6 workload can use a prebuilt, versioned dataset and record the environment and workload configuration.
- Makefile commands are documented, implemented only when ready, and distinguish safe stop commands from destructive reset commands.

## 17. Decisions

### Decided

- **Purchase retry:** the client generates a UUID `purchaseId` in the JSON body. Failed, uncommitted requests may reuse the ID; committed IDs return `409 PURCHASE_DUPLICATE`. There is no `Idempotency-Key` header or replay response.
- **Order identifier:** client-generated UUID `purchaseId`. Human-readable order numbers are out of scope.
- **Authentication:** local demo login uses email/password, scrypt password hashes, and one-hour HS256 bearer tokens. The local seeded account is `lab-user-001@example.test`; there is no public registration, password reset, refresh token, or production-grade rate limiting.
- **Error body format:** `{ error: { code, message, requestId, details } }`.
- **Unknown query parameters:** rejected with `400 UNKNOWN_QUERY_PARAMETER`.

### Still open

- Whether to extend the pinned reference dataset beyond Generation I.
- Whether the catalog snapshot is stored in MySQL or served from a local static source while shop fields are stored separately.
- Whether `purchase_items` is a separate table or single-item purchases live on `purchases`.
- Whether catalog search and filter parameters are included in the first iteration.
- Team Playwright folder structure and conventions (pending the team repository).
- Whether a UI is needed after the API lab is complete.


### Shipping integration acceptance criteria
- A successful purchase and its initial shipment row (`processingStatus = PENDING`, `deliveryStatus = WAITING_FOR_SHIPMENT`) commit atomically.
- The public purchase endpoint does not synchronously wait for the external Shipping provider.
- A real Express mock service is used for provider success and fault scenarios; the Shipping integration does not depend on WireMock.
- Provider HTTP 500, 429, timeout, and connection failure do not roll back a valid purchase or crash the core API.
- Retries are bounded, scheduled with backoff, and persisted across worker restarts; exhausted attempts become inspectable `FAILED` rows.
- Provider calls reuse `purchaseId` as an idempotency key, preventing duplicate provider shipments after ambiguous timeouts.
- Worker batch/lease handling prevents simultaneous workers from processing the same shipment and recovers expired claims.
- `GET /api/purchases/{id}/shipment` is authenticated, owner-scoped, reads local state, and remains usable while the provider is down.
- A database migration exists for already initialized volumes; changing the initial schema alone is not considered a migration.
- Playwright validates public responses, database state, provider request journal, recovery, delivery-status transitions, and isolation independently.
- The frontend can show current shipment state from the local PokéMart API even while the Shipping provider is down.

### Shipping integration decisions
- MySQL `shipments` rows are the durable queue for v1; no Redis/message broker is required.
- A separate worker handles retries and batches outside the purchase request path.
- Separate operational shipment-creation state (`processingStatus`) from customer-facing delivery state (`deliveryStatus`). A tracking number being created is not the same as a parcel being in transit or delivered.
- The test-only `PATCH /__test/shipments/{providerShipmentId}/status` endpoint can advance simulated delivery status and is never exposed through the public BFF.
- Purchase history shows a quick delivery status; opening a purchase shows order detail with tracking number and a delivery timeline.
- The default worker sweep for retryable shipment-creation jobs is one minute; tests override timing for deterministic, fast execution.
- The shipping provider mock is a Node.js + Express HTTP service in Docker Compose, with test-only fault-control routes unavailable through the public BFF.
