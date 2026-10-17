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
- `database/migrations/002_drop_idempotency_keys.sql` (existing volumes only)
- `database/README.md`

The schema must support the shop listing/reference relationship, wallet, Pokémon ownership, and purchases. Keep reference fields separate from shop-owned price/stock fields where practical. Do not import every PokéAPI table unless there is a clear learning need.

### Logical tables

- `pokemon_reference`: source ID (PK), name, types, sprite URL. Read-only during tests.
- `shop_listing`: pokemon source ID (PK/FK), price, stock, active flag. Lab-owned.
- `user_wallet`: user ID (PK), balance. Balance must never go negative.
- `user_inventory`: user ID + pokemon source ID (composite PK), quantity.
- `purchases`: client-generated purchase UUID (PK), user ID, Pokémon source ID, quantity, unit price, total price, created timestamp. The primary key prevents a successfully processed purchase ID from being used a second time.
- `purchase_items` is optional for the first iteration; a single-item purchase may be stored on `purchases`. Decide when the schema is finalized and record it here.
There is no idempotency-key table. A client creates a UUID purchase ID before its first attempt and sends that same ID in the JSON body for retries of the same attempt. A committed `purchases.id` is the duplicate guard. Failed transactions roll back the purchase row and all wallet/stock/inventory changes, so the ID remains usable on retry.

Requirements:
- A fresh MySQL volume automatically initializes schema and baseline shop seed data.
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
