# 01 — Scope and Architecture

## 1. Purpose

Build a practical API automation lab and web application around a fictional PokéMart where players can browse and purchase Pokémon. Use published static reference data from the PokéAPI project instead of inventing Pokémon data manually or calling a live API during every test run.

Learning goals:
- Practice Playwright Test + TypeScript API automation.
- Learn useful OOP design without overengineering the framework.
- Practice API contract, negative, boundary, integration, and persistence testing.
- Use WireMock to simulate a BFF before it is ready and to mock external dependencies.
- Practice MySQL schema, deterministic seed data, transactions, and repeatable environments.
- Practice third-party HTTP integration, a durable database-backed work queue, bounded retries, batch workers, idempotency, and outage recovery with a real Express mock service.
- Test pagination, query validation, business rules, purchase-ID retries, and later race conditions.
- Maintain two complementary functional test layers: end-to-end business flows and endpoint-level API specification/validation tests.
- Standardize local operations through a Makefile.
- Prepare the application, test data, and telemetry so a later k6 performance-testing lab can be added without redesigning the system.
- Provide a Next.js browser frontend for catalog browsing, trainer sign-in, checkout, wallet, inventory, and purchase history through the public BFF.

## 2. Scope

### In scope
- PokéMart catalog, wallet, inventory/ownership, and purchase workflow, including retrying with a client-generated purchase ID and duplicate detection.
- BFF and PokéMart API services.
- MySQL for shop-owned business data and durable shipment work/status.
- A Node.js + Express Shipping Mock and a separate worker process for asynchronous third-party shipping integration.
- Versioned Pokémon reference data based on https://github.com/PokeAPI/api-data.
- WireMock for mocked-BFF contract tests and selected external dependencies.
- Docker Compose, schema/seed scripts, OpenAPI specification, and Swagger UI for browsing it.
- Separate mocked-BFF and real-system test runs.
- Deterministic test-data setup, cleanup, and reset workflows suitable for repeatable functional tests and future performance runs.
- Basic structured application logs and health/readiness endpoints from the first implementation.
- Local demo email/password login with hashed credentials and short-lived JWTs for user-owned API resources.
- A browser frontend under `apps/web` that communicates with the public BFF and runs independently from Docker Compose.
- A Makefile as the common entry point for frequently used development and test commands.

### Out of scope for the first iteration
- Production-grade authentication/authorization, registration, password recovery, refresh/revocation, and login abuse controls.
- Real-money transactions or real Pokémon trading.
- Live PokéAPI calls during ordinary test execution.
- Kubernetes, cloud deployment, heavy load tests, or a full CI/CD pipeline.
- Human-readable order numbers (for example `ORD-20261017-000123`). Purchases use a client-generated UUID as `purchaseId`.
- A requirement to install the full observability stack for every functional test run.

## 4. High-level architecture

### Track A — WireMock contract suite

`Playwright Test -> WireMock (mock BFF)`

Purpose: run WireMock-specific contract scenarios, validating request/response shape, query parameters, status codes, and error contracts against configured mock responses. Dedicated WireMock-only tests also verify mapping completeness.

Limitation: tests against a mock prove behavior against configured mappings, not the real BFF implementation, downstream mapping, persistence, or business logic. Results must not be reported as equivalent to real-system coverage.

### Track B — Real integration

`Playwright Test -> Real BFF -> Real PokéMart API -> MySQL`

The real integration path must not mock the BFF or PokéMart API. Mock only dependencies outside the system boundary when appropriate. The initial version must not require a live PokéAPI call to serve requests or execute tests.

Real API validation and E2E cases live in their own suites and run against the configured BFF. `TEST_ENV=test|sit` selects URLs and test data from the matching environment file; Playwright projects select the test suite, not the environment.

### Shipping integration track

`Playwright -> BFF -> PokéMart API + MySQL -> Shipping Worker -> Shipping Mock (HTTP)`

The purchase transaction records a pending shipment in MySQL. The worker sends it asynchronously and retries transient failures. Shipping outages must not crash the purchase API or undo a committed purchase. See [`10-shipping-integration.md`](10-shipping-integration.md).

### Responsibilities

- **Web frontend** is the browser client. It calls the public BFF through same-origin `/api` routes rewritten by Next.js; it must not call the internal API directly. The development server runs on port `3002` outside Docker Compose.
- **BFF** is the only public entry point. It validates the public contract, forwards requests (including `X-Request-Id` and the purchase request body) to the PokéMart API, and maps responses and errors to the public contract.
- **PokéMart API** owns business rules, transactions, duplicate-purchase detection, and MySQL access.
- **MySQL** is the durable store for all shop-owned business state, including pending shipment work and retry metadata.
- **Shipping Worker** claims due shipment rows in bounded batches and performs HTTP calls outside database transactions.
- **Shipping Mock** simulates an external provider over HTTP; it is not trusted as durable PokéMart state and does not share the PokéMart database.

## 5. Technology choices

- TypeScript and Node.js
- Next.js App Router, React, and Tailwind CSS for the web frontend
- Playwright Test with `APIRequestContext`
- Express + TypeScript for BFF and PokéMart API
- MySQL 8.x with a pinned image tag
- WireMock with a pinned image tag for existing mocked-BFF tests
- Node.js + Express Shipping Mock in its own Docker Compose service
- Swagger UI with a pinned image tag, serving `specs/openapi.yaml`
- Docker Compose
- npm

Pin dependency and container versions; avoid floating `latest` tags for reproducibility.

## 6. Repository layout

This is the initial application-level layout. The internal `tests/` structure must be aligned with the team's existing Playwright repository once it is provided. Do not create a competing framework structure before reviewing it.

```text
pokemart-api-lab/
├── apps/
│   ├── bff/
│   ├── pokemart-api/
│   └── web/                    # Next.js frontend; run separately on port 3002
├── database/
│   ├── schema/
│   ├── seed/
│   └── README.md
├── data/
│   └── pokeapi/                 # pinned static snapshot or selected subset
├── wiremock/
│   └── mappings/
├── specs/
│   ├── openapi.yaml             # BFF public contract
│   ├── shipping-openapi.yaml     # provider mock contract (if split into a formal OpenAPI file)
│   ├── 10-shipping-integration.md
│   └── 09-frontend.md           # frontend behavior and integration boundary
├── scripts/
│   ├── import-reference-data/   # local import; no live fetch in tests
│   └── test-data/               # deterministic setup/reset helpers as needed
├── performance/
│   └── k6/                      # later phase
├── observability/
│   ├── prometheus/              # added in observability phase
│   ├── grafana/                 # added in that phase
│   └── elasticsearch-kibana/    # optional logs stack, enabled by Compose profile
├── tests/                       # adapt to team conventions
├── docker-compose.yml
├── docker-compose.observability.yml  # optional overlay, or use Compose profiles
├── Makefile
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

Do not duplicate the whole codebase under `labs/`. Learning instructions, if added later, should describe tasks and acceptance criteria while the application remains in its normal project locations. If the solution must be hidden from learners, use a separate branch or repository rather than relying on folder names.
