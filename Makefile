.PHONY: help install build up down ps logs docs swagger test test-mocked test-api test-pokeapi test-purchase-retry test-e2e db-seed db-reset

help: ## Show available local-lab commands (db-reset deletes local data)
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'

install: ## Install pinned Node.js dependencies from package-lock.json
	npm ci

build: ## Compile the BFF and PokéMart API TypeScript projects
	npm run build

up: ## Start the core stack and wait for it to become ready
	docker compose up -d --build --wait --remove-orphans
	docker compose exec -T bff curl -s http://localhost:4001/ready

down: ## Stop the core stack without deleting volumes
	docker compose down

ps: ## Show container status
	docker compose ps

logs: ## Follow logs for the local core stack
	docker compose logs -f

docs: ## Print the Scalar API reference URL (BFF, PokéMart, KYC, Payment, Shipping specs)
	@echo http://localhost:8081

swagger: docs ## Alias of `make docs` (Swagger UI was replaced by Scalar)

test: ## Run the configured Playwright suite
	npm test

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

db-seed: ## Confirm baseline data is present in the local lab
	docker compose exec -T mysql sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE" -e "SELECT COUNT(*) AS catalog_records FROM shop_listing;"'

db-reset: ## DESTRUCTIVE: recreate only the local Compose database volume
	docker compose down -v
	docker compose up -d mysql
