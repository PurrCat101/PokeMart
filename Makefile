.PHONY: help install build lint up down ps logs docs swagger test test-all test-kyc test-observability test-mocked test-api test-pokeapi test-purchase-retry test-e2e db-seed db-migrate db-status db-adopt db-reset fresh observe

help: ## Show available local-lab commands (db-reset deletes local data)
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'

install: ## Install pinned Node.js dependencies from package-lock.json
	npm ci

build: ## Compile the BFF and PokéMart API TypeScript projects
	npm run build

lint: ## Lint the web app (ESLint) and type-check every service
	npm run lint:web
	npm run build

up: ## Start the core stack and wait for it to become ready
	docker compose up -d --build --wait --remove-orphans
	docker compose exec -T bff curl -s http://localhost:4001/ready

observe: ## Start everything plus Grafana, Loki and Prometheus (profile observability)
	docker compose --profile observability up -d --build --wait --remove-orphans
	docker compose exec -T bff curl -s http://localhost:4001/ready
	@echo ""
	@echo "Grafana: http://localhost:4300 (change with GRAFANA_HOST_PORT)"

down: ## Stop everything, including Grafana/Loki/Prometheus, without deleting volumes
	docker compose --profile '*' down

fresh: ## DESTRUCTIVE: wipe all local data, then start everything clean (down -v + up)
	docker compose --profile '*' down -v
	$(MAKE) up

ps: ## Show container status
	docker compose ps

logs: ## Follow logs for the local core stack
	docker compose logs -f

docs: ## Print the Scalar API reference URL (BFF, PokéMart, KYC, Payment, Shipping specs)
	@echo http://localhost:8081

swagger: docs ## Alias of `make docs` (Swagger UI was replaced by Scalar)

test: ## Run the configured Playwright suite
	npm test

test-all: ## Lint, build, start the stack, run the whole Playwright suite, then always stop the stack
	$(MAKE) lint
	$(MAKE) up
	@npm test; status=$$?; $(MAKE) down; exit $$status

test-observability: ## Metrics tests; log and Grafana tests run only if `make observe` is up
	npm run test:observability

test-mocked: ## Run contract tests against WireMock
	npm run test:mocked

test-api: ## Run API-validation tests against the real BFF
	npm run test:api

test-pokeapi: ## Run internal PokéMart API endpoint tests directly
	npm run test:pokeapi

test-purchase-retry: ## Verify purchase ID retries and duplicate detection
	npm run test:purchase-retry

test-e2e: ## Run real BFF-to-MySQL journeys
	npm run test:e2e

test-kyc: ## KYC levels, review status and verification form (one account per test case)
	npm run test:kyc

db-seed: ## Confirm baseline data is present in the local lab
	docker compose exec -T mysql sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE" -e "SELECT COUNT(*) AS catalog_records FROM shop_listing;"'

db-migrate: ## Apply pending Liquibase changesets (safe to repeat)
	docker compose run --rm liquibase

db-status: ## Show which Liquibase changesets are applied or pending
	docker compose run --rm liquibase status --verbose

db-adopt: ## One time, for a volume created before Liquibase: record the baseline as already applied
	docker compose up -d --wait mysql
	docker compose run --rm liquibase changelog-sync

db-reset: ## DESTRUCTIVE: recreate the local database volume and re-apply every changeset
	docker compose down -v
	docker compose up -d --wait mysql
	docker compose run --rm liquibase
