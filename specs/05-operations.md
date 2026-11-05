# 05 — Operations

## 11. Docker Compose requirements

Compose defines `mysql`, `wiremock`, `pokemart-api`, `shipping-worker` (also runs the payment recovery sweep), `shipping-mock`, `payment-mock`, `kyc-api`, `bff`, and `api-reference` (Scalar).

## 11.1 Service ports (single source of truth)

Every other document refers to this table. Change a port here first. Inside Compose a service listens on the same number it publishes on the host (identity mapping), so a service started directly on the host (`npm run start:api`) behaves the same.

| Service | Port | Env override (host port) | Used by | Notes |
|---|---|---|---|---|
| PokéMart API | 4000 | `POKEMART_API_HOST_PORT` | BFF, workers | Internal. Not a public entry point. |
| BFF | 4001 | `BFF_HOST_PORT` | Web, Playwright | Only public API. |
| Shipping Mock | 4002 | `SHIPPING_MOCK_HOST_PORT` | Shipping worker | 3rd-party provider simulation. |
| Web frontend (Next.js) | 4003 | — | Browser, Playwright `ui` | Runs outside Compose (`npm run dev`). |
| Payment Mock | 4004 | `PAYMENT_MOCK_HOST_PORT` | PokéMart API, recovery worker | Stripe-style provider simulation. |
| KYC API | 4005 | `KYC_API_HOST_PORT` | PokéMart API | Internal service with its own data. |
| MySQL | 3306 in container | `MYSQL_HOST_PORT`, default **4306** | PokéMart API, test setup | Container keeps 3306; test env files use `MYSQL_PORT=4306`. |
| WireMock | 8080 | `WIREMOCK_HOST_PORT` | Mocked-BFF tests | |
| API reference (Scalar) | 8081 (container 8080) | `API_REFERENCE_HOST_PORT` | Browser | Renders `specs/openapi.yaml`. Replaces Scalar. |

**Why 4xxx and not 3xxx.** On Windows, Hyper-V/WSL/Docker Desktop reserve ranges of TCP ports at boot, and binding inside one fails with `EACCES` ("An attempt was made to access a socket in a way forbidden by its access permissions") even though nothing is listening. On the reference machine `2882–3281` and `3307–3406` were reserved, which blocked every 3000-series lab port and MySQL's old host port 3307. List the reserved ranges with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

If a lab port falls inside a reserved range, either override its host port through the env variable above (and the matching `*_BASE_URL` in `.env` / `tests/configs/.env.*`), or, from an elevated shell, run `net stop winnat` then `net start winnat` to release the ranges. Keep every lab port out of reserved ranges; do not assume the ranges are stable between reboots.

Inside Compose services use service names (`http://payment-mock:4004`, `http://kyc-api:4005`). Host-run tests use host ports. No two entries may share a host port.

## 12. Observability and performance-test readiness

Observability is introduced incrementally. The first application version must be diagnosable even before the full metrics and logging stack is installed.

### Initial application requirements

- Health and readiness endpoints with documented meanings:
  - `/health` (liveness): the process is running. No dependency checks.
  - `/ready` (readiness): MySQL and the PokéMart API are reachable. Returns `503` otherwise.
- Structured JSON logs to stdout/stderr so Docker can collect them.
- Each log line includes timestamp, severity, service name, environment, request ID, HTTP method, route template, status code, and request duration where applicable.
- Propagate the request ID from BFF to PokéMart API. Generate an ID if the incoming request does not provide a valid one.
- Log purchase outcomes (committed, rolled back, duplicate) without logging credentials, authorization headers, secrets, or unnecessary personal data.
- Log errors with enough context to diagnose the failure without duplicate stack traces at every layer.
- Metrics (when the observability phase is implemented): request count, request duration histogram, error count, in-flight requests, and dependency or database pool metrics where feasible. A purchase outcome counter may use a bounded `outcome` label.
- Keep metric labels low-cardinality. Do not use user IDs, Pokémon IDs, purchase IDs, raw URLs, or request IDs as labels.

### Observability stack roadmap

- **First observability phase:** Prometheus and Grafana for API, application, and container metrics.
- **Optional log-search phase:** Elasticsearch and Kibana, enabled through a dedicated Compose profile or overlay so routine API tests do not need the heavier stack.
- **Later tracing phase:** OpenTelemetry traces across BFF and PokéMart API, after the core flow and logs are stable.
- Docker Compose logs remain the simplest fallback for early development.

The full observability stack must not be a prerequisite for basic functional tests. Document the resource cost and start/stop commands for optional services.

### Future performance testing with k6

Performance testing is a later phase, but the system must support it:

- Keep the app stateless where practical; store durable business state in MySQL rather than process memory.
- Make the API, database, seed dataset, and service versions reproducible.
- Define workload scenarios separately from functional Playwright tests. Use k6 for load generation; do not use Playwright workers as a substitute.
- Initial candidate scenarios: read-heavy catalog browsing, Pokémon detail lookup, and a bounded purchase workload with controlled stock and wallet setup. Purchase load must use unique purchase IDs per new intent and reuse an ID only when explicitly testing retry or duplicate behavior.
- Measure throughput, error rate, and latency percentiles (p90, p95, p99 where useful). Define pass/fail thresholds only after an explicit target or baseline exists; do not invent an SLA.
- Capture the load-generator configuration, virtual-user or rate profile, duration, dataset size, container limits, and commit or version with each run.
- Keep performance runs separate from functional tests. Prevent concurrent functional tests or resets from modifying the measured dataset.
- Establish a smoke-level performance check before longer load, stress, or soak experiments.

## 13. Environment configuration

Use `.env.example` without real secrets:

```dotenv
BFF_BASE_URL=http://localhost:4001
POKEMART_API_BASE_URL=http://localhost:4000
WIREMOCK_BASE_URL=http://localhost:8080
API_REFERENCE_URL=http://localhost:8081
MYSQL_HOST=localhost
MYSQL_PORT=4306
MYSQL_HOST_PORT=4306
PAYMENT_BASE_URL=http://localhost:4004
KYC_BASE_URL=http://localhost:4005
KYC_API_KEY=local-only-kyc-key
KYC_REQUEST_TIMEOUT_MS=2000
MYSQL_DATABASE=pokemart_lab
MYSQL_USER=pokemart_user
MYSQL_PASSWORD=change_me_for_local_development
AUTH_JWT_SECRET=local-only-insecure-pokemart-jwt-secret-change-before-deploy
AUTH_TEST_EMAIL=lab-user-001@example.test
AUTH_TEST_PASSWORD=PokeMartLab!2026
```

The JWT secret and demo credentials above are local-only practice values. Tests that target another user or environment must configure matching `AUTH_TEST_EMAIL`, `AUTH_TEST_PASSWORD`, `AUTH_JWT_SECRET`, and `REAL_USER_ID`. Services inside Compose use service names such as `mysql` and `wiremock`. Host-run tests use published host ports. `localhost` inside a container refers to that same container.

## 14. Makefile command interface

The Makefile is the documented entry point for common local workflows. It wraps real scripts and Docker Compose commands and contains no application logic. `make help` lists commands and describes destructive actions.

| Command | Intended behavior |
|---|---|
| `make help` | Show available commands and descriptions |
| `make up` | Start the core stack and wait for required services to become ready |
| `make down` | Stop the core stack without deleting named volumes |
| `make ps` | Show container status |
| `make logs` | Follow core application and service logs |
| `make swagger` | Print the Scalar URL and confirm it responds |
| `make test` | Run the default functional suite chosen by project configuration |
| `make test-mocked` | Run contract tests against the WireMock BFF |
| `make test-api` | Run endpoint-level API validation tests against the selected real target |
| `make test-purchase-retry` | Verify purchase ID retry and duplicate behavior against the real BFF |
| `make test-e2e` | Run end-to-end business flows against the real BFF and services |
| `make db-seed` | Apply or verify baseline data using a documented safe strategy |
| `make db-reset` | Destructively recreate local lab data; warning required in help and docs |
| `make obs-up` / `make obs-down` | Start or stop optional observability services |
| `make perf-smoke` | Run a small k6 smoke workload once k6 scripts exist |
| `make perf-load` | Run a defined k6 load profile once the performance phase is implemented |

Commands may be added progressively. Do not expose a command as ready until its target script or service exists. `make down` must not remove volumes. Destructive reset commands must be clearly named and documented and must never target shared or production environments. If a command needs an environment selection, default to the local lab and fail safely on unknown targets.

## 15. Suggested local workflow

```bash
make up
make test-mocked
make test-api
make test-purchase-retry
make test-e2e
make logs
make down
```

Performance and observability workflows are added later:

```bash
make obs-up
make perf-smoke
make perf-load
make obs-down
```

`make db-reset` is destructive and must be used only when local lab data can be discarded. A performance run must not overlap with a reset or unrelated test run against the same dataset.


## 16. Shipping worker operations

See [`10-shipping-integration.md`](10-shipping-integration.md) for environment variables and lifecycle details. Operational requirements:

- The worker polls a bounded batch of due `shipments` rows, claims them with a lease, and releases the database transaction before calling HTTP.
- Pending work survives container restart because it is stored in MySQL. Expired leases are reclaimed after worker crashes.
- A provider outage must not make the BFF/PokéMart API fail readiness when local purchase processing and durable queuing still work. Report provider health separately.
- Retry count is bounded; exhausted work becomes `FAILED` and remains inspectable. Avoid infinite tight loops and avoid logging recipient addresses or secrets.
- Provide a Makefile target to inspect worker/mock logs and a safe command to stop/start the mock for outage exercises. Stopping the mock must not delete MySQL data.
