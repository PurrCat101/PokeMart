# 02 — Data

## 3. Reference data and business data

### Pokémon reference data

The local seed contains the Generation I PokéAPI REST API v2 response fields for Pokémon IDs 1-151. The checked-in SQL seed is the versioned snapshot retrieved on 2026-10-17; normal startup and tests do not make network calls. Review the PokeAPI license and attribution terms before redistributing this dataset.

Imported fields: source ID, name, base experience, types, and default front sprite URL when available. Base experience is retained in reference data but not included in catalog responses.

### PokéMart-owned data

The application owns fictional shop price, stock, user wallet balance, Pokémon ownership, and purchase records. These are lab business data, not official PokéAPI values. Price is `(150 + 2 × base_experience)` rounded to the nearest 50 and clamped to 200-1500. Stock tier is lower for Pokémon with higher base experience; a stable ID-based formula selects within the documented tier so seeds stay repeatable.

## 10. Database schema and initialization

Suggested files:

- `database/schema/001_create_shop_tables.sql`
- `database/seed/001_seed_shop_data.sql`
- `database/migrations/003_add_users_and_foreign_keys.sql` (existing volumes only)
- `database/README.md`

The schema must support the shop listing/reference relationship, wallet, Pokémon ownership, and purchases. Keep reference fields separate from shop-owned price/stock fields where practical. Do not import every PokéAPI table unless there is a clear learning need.

### Logical tables

- `pokemon_reference`: source ID (PK), name, types, sprite URL. Read-only during tests.
- `users`: stable user ID (PK), unique email, display name, nullable scrypt `password_hash`, active flag, and creation timestamp. The password hash is NULL for legacy profiles until credentials are provisioned.
- `shop_listing`: pokemon source ID (PK/FK), price, stock, active flag. Lab-owned.
- `user_wallet`: user ID (PK/FK to `users`), balance. Balance must never go negative; at most one wallet per user.
- `user_inventory`: user ID (FK to `users`) + pokemon source ID (FK to `pokemon_reference`) as a composite PK, quantity.
- `purchases`: client-generated purchase UUID (PK), user ID (FK to `users`), Pokémon source ID (FK to `pokemon_reference`), quantity, unit price, total price, created timestamp. The primary key prevents a successfully processed purchase ID from being used a second time.
- `purchase_items` is optional for the first iteration; a single-item purchase may be stored on `purchases`. Decide when the schema is finalized and record it here.
There is no idempotency-key table. A client creates a UUID purchase ID before its first attempt and sends that same ID in the JSON body for retries of the same attempt. A committed `purchases.id` is the duplicate guard. Failed transactions roll back the purchase row and all wallet/stock/inventory changes, so the ID remains usable on retry.

Requirements:
- A fresh MySQL volume automatically initializes schema and baseline shop seed data.
- The seed creates a local demo profile and scrypt password hash; it must never store plaintext credentials.
- The demo login issues a one-hour HS256 JWT. The API validates JWTs for wallet, inventory, and purchase resources; catalog reads remain public.
- Configure `AUTH_JWT_SECRET` outside the local lab with at least 32 random bytes. Never use the Compose development fallback in a deployed environment.
- Authentication is a local learning flow only: no public sign-up, password reset, refresh token, or production-grade abuse controls.
- Existing volumes backfill user profiles before adding foreign keys; imported profiles have no login password until credentials are provisioned.
- Use a dedicated development/test database and non-production credentials.
- Seed data is deterministic and documented.
- Do not insert baseline seed data on every container restart. The official MySQL image runs initialization scripts only when the data directory is empty.
- Provide a deliberate reset operation.
- Services wait for MySQL readiness; configure a health check.
- Tests do not mutate baseline records as their own test data.
- Avoid concurrent schema initialization from multiple test workers.

### Reference-data setup

Choose and document one approach:
1. Commit a suitably scoped, versioned static snapshot from `PokeAPI/api-data`, respecting license and attribution requirements; or
2. Provide an explicit setup/import step from a pinned local copy of that repository.

Normal startup and tests must not fetch the latest data from the internet. The lab must remain runnable when PokéAPI is unavailable.

### Reset safety

`docker compose down -v` removes Compose-managed volumes and deletes local database data. Document it as a destructive local reset only; never use it against shared or production environments.


## 11. Shipping persistence (new)

The shipping integration adds a PokéMart-owned `shipments` table linked one-to-one to `purchases.id`. This row is both the durable work item and the local shipment status record; v1 does not require Redis or a separate broker.

Required fields: `purchase_id` (unique FK), `status`, `provider_shipment_id`, `tracking_number`, `attempt_count`, `next_attempt_at`, `claimed_until` (worker lease), `last_error_code`, `last_error_message`, `created_at`, and `updated_at`. Index due work by `(status, next_attempt_at)` and expired leases by `(status, claimed_until)`. Statuses are `PENDING`, `PROCESSING`, `RETRY_WAIT`, `ACCEPTED`, `FAILED`, and `UNKNOWN`.

The purchase transaction inserts the shipment row as `PENDING` atomically with purchase/wallet/stock/inventory changes. Provider HTTP calls happen asynchronously in a worker and outside the database transaction. Provider outages therefore do not undo a committed purchase. Existing volumes require a numbered migration because MySQL init scripts only run for an empty data directory. See [`10-shipping-integration.md`](10-shipping-integration.md) for the schema contract and migration requirements.
