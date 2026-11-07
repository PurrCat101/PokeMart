.PHONY: help install build build-images lint up down ps logs docs swagger test test-all test-kyc test-items test-observability test-mocked test-api test-pokeapi test-purchase-retry test-e2e db-seed db-migrate db-status db-adopt db-reset fresh observe

# Container engine: Podman only. `podman compose` must use podman-compose as its provider (set the user
# environment variable PODMAN_COMPOSE_PROVIDER to the podman-compose.exe path). Without it, `podman compose`
# hands off to Docker Desktop's docker-compose.exe, which cannot reach the Podman machine on Windows.
COMPOSE ?= podman compose

# Call npm.cmd, not `npm`: GNU make (msys) finds the extensionless `npm` bash script first, and its shebang
# launches WSL bash ("execvpe(/bin/bash) failed"). npm.cmd is the real Windows launcher.
NPM ?= npm.cmd

# A terminal or editor that was already open when PODMAN_COMPOSE_PROVIDER was set does not see it (environment
# variables are copied at start-up), and `podman compose` would silently fall back to Docker Desktop. So when the
# variable is missing, look for podman-compose.exe in the pip --user scripts folder and use that.
ifndef PODMAN_COMPOSE_PROVIDER
PIP_USER_SCRIPTS := $(shell python -c "import sysconfig; print(sysconfig.get_path('scripts', 'nt_user').replace(chr(92), '/'))" 2>/dev/null)
PODMAN_COMPOSE_EXE := $(shell test -f "$(PIP_USER_SCRIPTS)/podman-compose.exe" && echo "$(PIP_USER_SCRIPTS)/podman-compose.exe")
ifneq ($(PODMAN_COMPOSE_EXE),)
export PODMAN_COMPOSE_PROVIDER := $(PODMAN_COMPOSE_EXE)
endif
endif

help: ## Show available local-lab commands (db-reset deletes local data)
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'

install: ## Install pinned Node.js dependencies from package-lock.json
	$(NPM) ci

build: ## Compile the BFF and PokéMart API TypeScript projects
	$(NPM) run build

lint: ## Lint the web app (ESLint) and type-check every service
	$(NPM) run lint:web
	$(NPM) run build

# podman-compose 1.6 cannot resolve `dockerfile: apps/<svc>/Dockerfile` on Windows ("no Containerfile ...
# found in context directory"), so images are built with `podman build` and compose only starts them.
# Tags match what compose expects: localhost/<project>_<service>:latest (project = labplaywrightapi).
IMAGE_PREFIX ?= localhost/labplaywrightapi_

build-images: ## Build every service image with podman (compose --build does not work on Windows)
	podman build -t $(IMAGE_PREFIX)liquibase:latest database/liquibase
	podman build -f apps/pokemart-api/Dockerfile -t $(IMAGE_PREFIX)pokemart-api:latest -t $(IMAGE_PREFIX)shipping-worker:latest .
	podman build -f apps/payment-mock/Dockerfile -t $(IMAGE_PREFIX)payment-mock:latest .
	podman build -f apps/kyc-api/Dockerfile -t $(IMAGE_PREFIX)kyc-api:latest .
	podman build -f apps/bff/Dockerfile -t $(IMAGE_PREFIX)bff:latest .
	podman build -f apps/shipping-mock/Dockerfile -t $(IMAGE_PREFIX)shipping-mock:latest .

# podman-compose's `up --wait` never returns while any service lacks a healthcheck (kyc-api, shipping-worker)
# or has exited (liquibase), so readiness is polled through the BFF /ready endpoint instead (up to ~2 minutes).
WAIT_READY = for i in $$(seq 1 60); do $(COMPOSE) exec -T bff curl -sf http://localhost:4001/ready && exit 0; sleep 2; done; echo "BFF did not become ready in time"; exit 1

up: build-images ## Build images, start the core stack and wait for it to become ready
	$(COMPOSE) up -d --remove-orphans
	@$(WAIT_READY)

observe: build-images ## Build images, start everything plus Grafana, Loki and Prometheus (profile observability)
	$(COMPOSE) --profile observability up -d --remove-orphans
	@$(WAIT_READY)
	@echo ""
	@echo "Grafana: http://localhost:4300 (change with GRAFANA_HOST_PORT)"

# podman-compose does not understand the `--profile '*'` wildcard (it left Loki, Prometheus and Grafana
# running), so the observability profile is named explicitly. Add new profiles here if the file gets any.
PROFILES = --profile observability

down: ## Stop everything, including Grafana/Loki/Prometheus, without deleting volumes
	$(COMPOSE) $(PROFILES) down

fresh: ## DESTRUCTIVE: wipe all local data, then start everything clean (down -v + up)
	$(COMPOSE) $(PROFILES) down -v
	$(MAKE) up

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Follow logs for the local core stack
	$(COMPOSE) logs -f

docs: ## Print the Scalar API reference URL (BFF, PokéMart, KYC, Payment, Shipping specs)
	@echo http://localhost:8081

swagger: docs ## Alias of `make docs` (Swagger UI was replaced by Scalar)

test: ## Run the configured Playwright suite
	$(NPM) test

test-all: ## Lint, build, start the stack, run the whole Playwright suite, then always stop the stack
	$(MAKE) lint
	$(MAKE) up
	@$(NPM) test; status=$$?; $(MAKE) down; exit $$status

test-observability: ## Metrics tests; log and Grafana tests run only if `make observe` is up
	$(NPM) run test:observability

test-mocked: ## Run contract tests against WireMock
	$(NPM) run test:mocked

test-api: ## Run API-validation tests against the real BFF
	$(NPM) run test:api

test-pokeapi: ## Run internal PokéMart API endpoint tests directly
	$(NPM) run test:pokeapi

test-purchase-retry: ## Verify purchase ID retries and duplicate detection
	$(NPM) run test:purchase-retry

test-e2e: ## Run real BFF-to-MySQL journeys
	$(NPM) run test:e2e

test-kyc: ## KYC levels, review status and verification form (one account per test case)
	$(NPM) run test:kyc

test-items: ## Item order history and item inventory (API and web UI)
	$(NPM) run test:items

db-seed: ## Confirm baseline data is present in the local lab
	$(COMPOSE) exec -T mysql sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE" -e "SELECT COUNT(*) AS catalog_records FROM shop_listing;"'

db-migrate: ## Apply pending Liquibase changesets (safe to repeat)
	$(COMPOSE) run --rm liquibase

db-status: ## Show which Liquibase changesets are applied or pending
	$(COMPOSE) run --rm liquibase status --verbose

db-adopt: ## One time, for a volume created before Liquibase: record the baseline as already applied
	$(COMPOSE) up -d --wait mysql
	$(COMPOSE) run --rm liquibase changelog-sync

db-reset: ## DESTRUCTIVE: recreate the local database volume and re-apply every changeset
	$(COMPOSE) down -v
	$(COMPOSE) up -d --wait mysql
	$(COMPOSE) run --rm liquibase
