# 05 — Operations

## 11. Docker Compose requirements

Compose defines `mysql`, `wiremock`, `pokemart-api`, `bff`, and `swagger-ui`.

Requirements:
- Persistent MySQL volume for normal runs.
- SQL initialization scripts mounted into the supported initialization directory.
- MySQL health check and clear startup behavior when the database is unavailable.
- Internal Docker network and published ports needed by host-run tests.
- Separate WireMock mappings for the mocked BFF and for external dependency mocks.
- Pinned image versions and no production secrets or data.

Swagger UI example (pin the image to a specific v5 patch release):

```yaml
swagger-ui:
  image: swaggerapi/swagger-ui:v5.x.x
  ports:
    - "8081:8080"
  environment:
    URLS: '[{"url":"/openapi.yaml","name":"BFF Public API"},{"url":"/pokemart-openapi.yaml","name":"PokéMart Internal API"}]'
    URLS_PRIMARY_NAME: BFF Public API
  volumes:
    - ./specs/openapi.yaml:/usr/share/nginx/html/openapi.yaml:ro
    - ./specs/pokemart-openapi.yaml:/usr/share/nginx/html/pokemart-openapi.yaml:ro
```

Run Playwright on the host initially to simplify debugging. Containerizing the test runner is a later enhancement.

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
BFF_BASE_URL=http://localhost:3001
POKEMART_API_BASE_URL=http://localhost:3000
WIREMOCK_BASE_URL=http://localhost:8080
SWAGGER_UI_URL=http://localhost:8081
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=pokemart_lab
MYSQL_USER=pokemart_user
MYSQL_PASSWORD=change_me_for_local_development
LAB_USER_ID=lab-user-001
```

Services inside Compose use service names such as `mysql` and `wiremock`. Host-run tests use published host ports. `localhost` inside a container refers to that same container.

## 14. Makefile command interface

The Makefile is the documented entry point for common local workflows. It wraps real scripts and Docker Compose commands and contains no application logic. `make help` lists commands and describes destructive actions.

| Command | Intended behavior |
|---|---|
| `make help` | Show available commands and descriptions |
| `make up` | Start the core stack and wait for required services to become ready |
| `make down` | Stop the core stack without deleting named volumes |
| `make ps` | Show container status |
| `make logs` | Follow core application and service logs |
| `make swagger` | Print the Swagger UI URL and confirm it responds |
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
