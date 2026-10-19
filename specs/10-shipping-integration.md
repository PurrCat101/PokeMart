# 10 — Shipping Integration and Resilience Lab

## 1. Purpose and boundary

Add a fictional third-party Shipping Provider to PokéMart so the lab can exercise HTTP integration, persistence, retries, batch workers, idempotency, recovery, and observability. The provider is represented by a **real Node.js + Express HTTP mock service in Docker Compose**. Do not use WireMock for this integration; WireMock remains available for the existing mocked-BFF contract suite.

PokéMart owns purchases, shipment state, retry scheduling, and recovery. The provider owns only its simulated shipment records and responses. The mock is replaceable: changing `SHIPPING_BASE_URL` must not require changes to purchase business logic.

## 2. Architecture

```text
Playwright API tests
       |
       v
Public BFF :3001
       |
       v
PokéMart API :3000 ---- MySQL
       |                 | purchases
       |                 | shipments (durable work + status)
       v                 |
Shipping Worker ---------+
       |
       | HTTP (SHIPPING_BASE_URL)
       v
Shipping Mock :3002 (container port; host port configurable)
```

- The BFF remains the only public entry point for client business journeys.
- The PokéMart API commits the purchase and a `PENDING` shipment record in the **same MySQL transaction** as wallet, stock, inventory, and purchase changes. A shipping outage must not roll back a valid purchase.
- A separate worker claims due shipment rows in bounded batches and calls the provider. It must not keep a database transaction open while waiting for the HTTP provider.
- `shipments` is the durable work queue and local delivery-status projection for this lab; do not add Redis or a message broker in v1. This deliberately teaches the database-backed queue pattern.
- The worker is a separate Compose service/process using the existing PokéMart application code and database configuration; do not put long-running retry loops inside the public purchase request handler.
- The mock is not part of the PokéMart business boundary and must not share the PokéMart database.

## 3. Shipping Mock HTTP contract

Base URL inside Compose: `http://shipping-mock:3002`. The host-published port is configurable and must not be hard-coded in tests.

### Provider endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness of the mock process |
| `POST` | `/shipments` | Create or return the shipment for an idempotency key |
| `GET` | `/shipments/:providerShipmentId` | Read provider-side shipment status |
| `GET` | `/__test/requests` | Inspect received requests for assertions; lab/test only |
| `POST` | `/__test/reset` | Clear mock request history and simulated provider state; lab/test only |
| `PUT` | `/__test/mode` | Select deterministic fault behavior; lab/test only |

### Create request

```json
{
  "purchaseId": "00000000-0000-4000-8000-000000000001",
  "recipient": {
    "name": "Lab Trainer",
    "address": "1 Test Street"
  },
  "items": [
    { "pokemonId": 25, "pokemonName": "pikachu", "quantity": 1 }
  ]
}
```

Required header: `Idempotency-Key: <purchaseId>`. The key must be stable across retries. The mock must return the same provider shipment for repeated calls with the same key and must not create duplicates.

Successful response: `202 Accepted` with `providerShipmentId`, `status: "LABEL_CREATED"`, and `trackingNumber`. This confirms that a tracking label exists; it does not mean the parcel has been picked up, is in transit, or has been delivered.

### Deterministic mock modes

- `success`: return a stable `202` response.
- `http-500`: return `500` without accepting the shipment.
- `rate-limit`: return `429` and optional `Retry-After`.
- `timeout-before-accept`: delay longer than the caller's timeout and do not create a provider shipment.
- `ambiguous-timeout`: create the provider shipment, then delay the response past the caller's timeout. A retry with the same idempotency key must return the original provider shipment.
- `unavailable`: simulate a temporarily unavailable provider (for example, `503`).

The test-control endpoints are disabled or inaccessible outside the local test profile. Never expose them through the public BFF.

## 4. PokéMart database changes

Add a `shipments` table with at least:

| Column | Rule |
|---|---|
| `purchase_id` | UUID, PK or unique FK to `purchases.id`; one shipment per purchase in v1 |
| `processing_status` | `PENDING`, `PROCESSING`, `RETRY_WAIT`, `LABEL_CREATED`, `FAILED`, or `UNKNOWN`; controls queue/retry lifecycle |
| `delivery_status` | `WAITING_FOR_SHIPMENT`, `LABEL_CREATED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, or `DELIVERY_FAILED`; customer-facing shipment progress |
| `provider_shipment_id` | Nullable provider identifier |
| `tracking_number` | Nullable tracking number |
| `attempt_count` | Non-negative integer |
| `next_attempt_at` | When a retry becomes eligible |
| `claimed_until` | Nullable worker lease expiry for crash recovery |
| `last_error_code` | Nullable bounded machine-readable error category |
| `last_error_message` | Nullable sanitized diagnostic text; no secrets or full request bodies |
| `created_at`, `updated_at` | Millisecond timestamps |

Required indexes: due-work lookup on `(status, next_attempt_at)`, lease recovery on `(status, claimed_until)`, and unique relation to the purchase. Add checks for non-negative attempt count and allowed status values where supported.

For new volumes, update the canonical schema. For existing MySQL volumes, add a numbered migration; do not assume `docker-entrypoint-initdb.d` scripts rerun against an initialized volume. The migration must be safe to inspect and apply once, and its execution steps must be documented. Do not use `docker compose down -v` as a migration.

## 5. Purchase and shipment lifecycle

1. Validate and commit a purchase using the existing purchase rules.
2. In that same transaction, insert `shipments.processing_status = PENDING`, `delivery_status = WAITING_FOR_SHIPMENT`, `attempt_count = 0`, and `next_attempt_at = NOW()`. The order itself already exists; `ORDER_PLACED` is the order lifecycle, while `WAITING_FOR_SHIPMENT` is the customer-facing delivery lifecycle.
3. Return the existing purchase response contract. Do not synchronously call the provider from `POST /api/purchases`; shipment processing is asynchronous.
4. Worker claims up to `SHIPPING_BATCH_SIZE` eligible rows using a short transaction and a lease. Multiple workers must not process the same row concurrently.
5. Worker calls `POST /shipments` outside the DB transaction with `Idempotency-Key: purchaseId`. Once the label exists, a separate reconciliation loop calls `GET /shipments/:providerShipmentId` to synchronize delivery progress.
6. On provider acceptance, persist `processing_status = LABEL_CREATED`, provider ID and tracking number, clear error/lease, and stop label-creation retries. Set customer-facing `delivery_status = LABEL_CREATED` (shipping label / tracking number created). This does not mean the parcel has been picked up or delivered.
7. On transient failure, persist `processing_status = RETRY_WAIT`, increment attempt count, set `next_attempt_at` using bounded exponential backoff with jitter, clear or expire the lease, and log the attempt. Keep `delivery_status = WAITING_FOR_SHIPMENT` until a tracking number is actually issued.
8. After the configured maximum attempts, persist `processing_status = FAILED` and stop automatic retries. The row remains available for diagnosis and a future manual retry mechanism; customer-facing status remains `WAITING_FOR_SHIPMENT` and the UI must also show a non-blocking issue/retry message so it does not imply delivery has started.
9. On ambiguous timeout, use the same idempotency key and reconcile with provider status where possible. Do not create a new key or blindly create a second shipment. Persist `UNKNOWN` only when the result cannot yet be determined; schedule reconciliation rather than treating it as a confirmed failure.
10. When a worker crashes while a row is `PROCESSING`, an expired `claimed_until` makes the work eligible for recovery. A restart must not lose pending work.

Initial retry policy is configurable, with documented defaults (suggested: max 5 attempts; exponential backoff capped at 60 seconds). Tests should use short deterministic delays. Do not retry non-transient provider validation errors (4xx other than explicitly retryable 429); retry 429 according to `Retry-After` when valid, and retry 5xx/network errors/timeouts within the configured limit.

## 6. Shipment creation vs delivery progress

Keep the internal retry/processing state separate from the customer-visible delivery state. The worker's job is to create a shipment and obtain a tracking number; the provider/mock owns the simulated delivery progression. The local DB stores the latest provider delivery state so the UI can read it without calling the provider.

Customer-facing delivery statuses and display labels:

| API status | Thai UI label | Meaning |
|---|---|---|
| `ORDER_PLACED` | สั่งซื้อแล้ว | Purchase exists; used as the order-level milestone |
| `WAITING_FOR_SHIPMENT` | รอจัดส่ง | Purchase committed, but no tracking number has been issued yet |
| `LABEL_CREATED` | ออกเลขพัสดุแล้ว | Provider accepted the request and returned a tracking number |
| `IN_TRANSIT` | อยู่ระหว่างจัดส่ง | Parcel has entered transit |
| `OUT_FOR_DELIVERY` | กำลังนำจ่าย | Parcel is out for final delivery |
| `DELIVERED` | จัดส่งสำเร็จ | Provider confirms delivery |
| `DELIVERY_FAILED` | จัดส่งไม่สำเร็จ | Delivery attempt failed; distinct from failure to create a shipment |

`processing_status` is operational state (`PENDING`, `PROCESSING`, `RETRY_WAIT`, `LABEL_CREATED`, `FAILED`, `UNKNOWN`) and must not be shown as if it were the delivery timeline. `ORDER_PLACED` comes from the purchase; the shipment status response may expose it as `orderStatus` alongside `deliveryStatus`.

### Simulating provider status changes

The Express Shipping Mock must support a test-only endpoint:

- `PATCH /__test/shipments/{providerShipmentId}/status`
- Request: `{ "status": "IN_TRANSIT" }` (allowed values are `LABEL_CREATED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`)
- Response returns the provider shipment ID and updated status.
- Invalid statuses return `400`; unknown provider shipment IDs return `404`.
- Status changes must follow valid forward transitions, except the test reset endpoint may clear state. Reject impossible transitions such as `DELIVERED -> IN_TRANSIT`.
- This endpoint is only for local/test use and must never be exposed through the public BFF or enabled in a production profile.
- A separate worker reconciliation loop periodically reads provider status and persists it in PokéMart MySQL. The UI never reads mock state directly. Provider outages leave the last known delivery status intact while label creation/retry and reconciliation resume when the provider recovers.

### One-minute recovery/batch exercise

1. Set the Shipping Mock mode to `unavailable` and create a purchase.
2. Assert purchase succeeds, wallet/stock/inventory updates are committed, shipment `processingStatus` is `RETRY_WAIT` after the first attempt (or `PENDING` before the worker runs), and `deliveryStatus` remains `WAITING_FOR_SHIPMENT`.
3. Wait for one or more scheduled sweeps, then set Mock mode to `success`.
4. The next due batch retries the existing shipment work; it must not require a second purchase. Assert the same purchase eventually gets a tracking number and `deliveryStatus = LABEL_CREATED`.
5. Use the test-only status endpoint to move the provider shipment through `IN_TRANSIT`, `OUT_FOR_DELIVERY`, and `DELIVERED`. The reconciliation worker syncs each state to PokéMart, and the order history/detail UI shows the new state.
6. For deterministic CI, override poll/sync intervals with short test values and use bounded polling rather than waiting a real minute. Keep a separate smoke/manual test with the default 60-second sweep.

## 7. Status query API

Add an authenticated, owner-scoped read endpoint to both public and internal contracts:

- Public: `GET /api/purchases/{purchaseId}/shipment`
- Internal: `GET /pokemart/v1/purchases/{purchaseId}/shipment`

Return the current local shipment state, not a live proxy to the provider. Suggested public response:

```json
{
  "purchaseId": "00000000-0000-4000-8000-000000000001",
  "orderStatus": "ORDER_PLACED",
  "processingStatus": "PENDING",
  "deliveryStatus": "WAITING_FOR_SHIPMENT",
  "trackingNumber": null,
  "attemptCount": 0,
  "lastError": null,
  "createdAt": "2026-10-19T00:00:00.000Z",
  "updatedAt": "2026-10-19T00:00:00.000Z"
}
```

- Require the existing bearer JWT and scope lookup to the authenticated user's purchase.
- Return `400 VALIDATION_ERROR` for malformed UUID and `404 PURCHASE_NOT_FOUND` when the purchase is not owned by the caller or does not exist. Do not reveal another user's purchase/shipment.
- The endpoint must work while the provider is down because it reads local MySQL state only.
- Do not expose provider internals, raw upstream bodies, stack traces, or unfiltered error details.

## 7. Health, readiness, logs, and configuration

- `/health` stays a process-liveness check and must not fail solely because Shipping is unavailable.
- `/ready` verifies the service's essential local dependencies (including MySQL/schema). Shipping availability is reported as a dependency status/metric, but must not make the core purchase API unready when asynchronous shipment processing can continue to queue work.
- The worker exposes its own health signal or heartbeat. A stopped worker must be detectable; queued shipment rows remain durable.
- Emit structured logs with service name, request/correlation ID, purchase ID where appropriate, attempt number, outcome, provider latency, and error category. Never log authorization headers, secrets, or full recipient addresses.
- Add counters for shipment attempts/results, retries, exhausted retries, queue depth, oldest pending age, provider latency, and provider errors. Keep labels low-cardinality; never label metrics by purchase ID or tracking number.

Configuration (example names; all values validated on startup):
- `SHIPPING_BASE_URL=http://shipping-mock:3002`
- `SHIPPING_REQUEST_TIMEOUT_MS=1000`
- `SHIPPING_MAX_ATTEMPTS=5`
- `SHIPPING_BATCH_SIZE=10`
- `SHIPPING_POLL_INTERVAL_MS=60000` (default one-minute sweep for due/retry work; tests may override to a few hundred milliseconds)
- `SHIPPING_STATUS_SYNC_INTERVAL_MS=15000` (provider delivery-status reconciliation; tests may override this separately)
- `SHIPPING_BACKOFF_BASE_MS=500`
- `SHIPPING_BACKOFF_MAX_MS=60000`

## 8. Playwright automation scope

Create a dedicated real-system shipping suite; do not place these cases under WireMock-only tests. Test through the public BFF, and verify MySQL and the mock's test journal where appropriate.

Minimum scenarios:
1. Purchase succeeds; delivery is initially `WAITING_FOR_SHIPMENT`, then becomes `LABEL_CREATED` with a tracking number after the worker succeeds.
2. Provider returns 500; purchase and wallet/stock/inventory changes remain committed, shipment is scheduled for retry, and the API remains healthy.
3. Provider returns 429; worker honors valid `Retry-After` or applies bounded retry policy.
4. Provider is unavailable or times out; purchase remains queryable and queued work persists across worker restart.
5. Provider recovers; pending shipment obtains a tracking number without a new purchase.
6. Ambiguous timeout; retry uses the same idempotency key and no duplicate provider shipment is created.
7. Max attempts exhausted; shipment becomes `FAILED`, attempt count is correct, and no infinite retry occurs.
8. Multiple due shipments are processed in bounded batches; no row is lost or processed concurrently twice.
9. Two workers overlap; leases/locking prevent concurrent claims of the same shipment.
10. Worker is stopped and restarted; expired claims and pending rows are recovered.
11. A user cannot query another user's shipment.
12. Missing/invalid token, malformed UUID, unknown purchase, response schema, request IDs, and sanitized error output are validated.
13. Test cleanup resets mock state and restores only test-owned PokéMart data; never depend on a previous test's worker timing.

Assertions must distinguish purchase outcome from shipping outcome. A shipping failure is not a purchase failure in this async design. Poll for state with a bounded timeout rather than using fixed sleeps.

## 9. Delivery phases

- **Phase 1 — Contract + asynchronous worker loop:** add provider mock, DB state, a single worker, success/500/timeout, status endpoint, and Playwright assertions.
- **Phase 2 — Resilience:** bounded retries/backoff, 429, ambiguous timeout, idempotency, leases, restart recovery, and batch-size tests.
- **Phase 3 — Observability and operations:** metrics/logs, queue-age monitoring, worker heartbeat, manual recovery procedure, and optional dashboard.

## 10. Decisions and non-goals

- Shipping is a third-party dependency represented by a real Express HTTP mock, not WireMock.
- No separate queue broker in v1; MySQL `shipments` rows provide durable queue semantics.
- No shipping database is shared with PokéMart. Mock state may be in memory because it is only a test provider; PokéMart's own shipment state must be durable.
- Delivery progress is simulated through test-only Express Mock controls and synchronized into local MySQL by a worker. `LABEL_CREATED` means a tracking number exists, not that the parcel is in transit or delivered.
- No automatic retry inside the public purchase request and no unbounded retries.
