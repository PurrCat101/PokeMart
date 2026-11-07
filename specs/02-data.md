# 02 — Data

## 3. Reference data and business data

### Pokémon reference data

The local seed contains every main Pokédex Pokémon resource available in the pinned `PokeAPI/api-data` checkout (currently 1,025 IDs) and 2,222 canonical item names. The source's duplicate Roseli Berry resource is canonicalized to its lowest source ID so the unique shop-item model remains valid. The checked-in SQL seed is generated from commit `447bd5c378bf87da964bfe4dd7487a7bf1d97cbd`; normal startup and tests do not make network calls. Review the PokeAPI license and attribution terms before redistributing this dataset.

Pokémon reference fields are source ID, name, base experience, types, and default front sprite URL. Item reference fields are source ID, name, PokéAPI cost, category, and default sprite URL. PokéAPI values are reference data only; price, stock, sale activation, and KYC requirement are owned by PokéMart.

### PokéMart-owned data

The application owns fictional shop price, stock, user wallet balance, Pokémon ownership, and purchase records. These are lab business data, not official PokéAPI values. Price is `(150 + 2 × base_experience)` rounded to the nearest 50 and clamped to 200-1500. Stock tier is lower for Pokémon with higher base experience; a stable ID-based formula selects within the documented tier so seeds stay repeatable.

## 10. Database schema and initialization

Suggested files:

- `database/schema/001_create_shop_tables.sql`
- `database/seed/001_seed_shop_data.sql`
- `database/liquibase/db.changelog-master.yaml` (applies the schema and seed files; new changes are added here)
- `database/migrations/003_add_users_and_foreign_keys.sql` (history, already part of the baseline schema)
- `database/README.md`

The schema must support the shop listing/reference relationship, wallet, Pokémon ownership, and purchases. Keep reference fields separate from shop-owned price/stock fields where practical. Do not import every PokéAPI table unless there is a clear learning need.

### Logical tables

- `pokemon_reference`: source ID (PK), name, types, sprite URL. Read-only during tests.
- `users`: stable user ID (PK), unique email, display name, nullable scrypt `password_hash`, active flag, and creation timestamp. The password hash is NULL for legacy profiles until credentials are provisioned.
- `shop_listing`: Pokémon source ID (PK/FK), price, stock, active flag, and `required_kyc_level` (0–2). Lab-owned.
- `item_reference`: source ID (PK), name, PokéAPI cost, category, and sprite URL. Read-only snapshot.
- `item_listing`: item source ID (PK/FK), price, stock, active flag, and `required_kyc_level` (0–2). Lab-owned.
- `user_wallet`: user ID (PK/FK to `users`), balance. Balance must never go negative; at most one wallet per user.
- `user_inventory`: user ID (FK to `users`) + pokemon source ID (FK to `pokemon_reference`) as a composite PK, quantity.
- `user_item_inventory`: user ID + item source ID as a composite PK, quantity. This keeps Pokémon and item ownership type-safe while the established Pokémon purchase API remains backward compatible.
- `purchases`: client-generated purchase UUID (PK), user ID (FK to `users`), Pokémon source ID (FK to `pokemon_reference`), quantity, unit price, total price, created timestamp. The primary key prevents a successfully processed Pokémon purchase ID from being used a second time.
- `item_purchases`: client-generated purchase UUID (PK), user ID (FK to `users`), item source ID (FK to `item_reference`), quantity, price snapshots, and created timestamp. It records completed item transactions separately from Pokémon purchases so shipment behavior remains Pokémon-only.
- KYC levels are **not** stored in MySQL. They are owned by the KYC API (see [`12-kyc.md`](12-kyc.md)); only the listing's `required_kyc_level` (0–2) lives in `shop_listing` and `item_listing`.
- `top_ups`: client-generated UUID (PK), user ID, integer THB amount, payment state, provider payment ID, recovery fields, and timestamps. `COMPLETED` is the only state that credits the wallet.
There is no idempotency-key table. A client creates a UUID purchase ID before its first attempt and sends that same ID in the JSON body for retries of the same attempt. A committed `purchases.id` or `item_purchases.id` is the duplicate guard for its respective endpoint. Failed transactions roll back the purchase row and all wallet/stock/inventory changes, so the ID remains usable on retry.

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

The checked-in SQL seed and manifest are the runtime source of truth; no `api-data` checkout is required. For a deliberate future refresh, obtain a separately pinned PokeAPI/api-data checkout and run `node scripts/import-reference-data.mjs <path-to-api-data> --max=1351 --items`. It writes `010_reference_pokemon.sql`, `011_reference_items.sql`, `012_seed_catalog.sql`, and `data/reference-manifest.json`. Pokémon are always KYC 0; item KYC is explicitly assigned by item name. Generated SQL is committed.

Normal startup and tests must not fetch the latest data from the internet. The lab must remain runnable when PokéAPI is unavailable.

### Reset safety

`make fresh` (which runs `down -v`) removes Compose-managed volumes and deletes local database data. Document it as a destructive local reset only; never use it against shared or production environments.


## 11. Shipping persistence (new)

The shipping integration adds a PokéMart-owned `shipments` table linked one-to-one to `purchases.id`. This row is both the durable work item and the local shipment status record; v1 does not require Redis or a separate broker.

Required fields: `purchase_id` (unique FK), `processing_status`, `delivery_status`, `provider_shipment_id`, `tracking_number`, `attempt_count`, `next_attempt_at`, `claimed_until` (worker lease), `last_error_code`, `last_error_message`, `created_at`, and `updated_at`. Index due work by `(processing_status, next_attempt_at)` and expired leases by `(processing_status, claimed_until)`. Operational states are `PENDING`, `PROCESSING`, `RETRY_WAIT`, `LABEL_CREATED`, `FAILED`, and `UNKNOWN`. Customer-facing delivery states are `WAITING_FOR_SHIPMENT`, `LABEL_CREATED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, and `DELIVERY_FAILED`. `ORDER_PLACED` is an order milestone, not a delivery state.

The purchase transaction inserts the shipment row as `PENDING` atomically with purchase/wallet/stock/inventory changes. Provider HTTP calls happen asynchronously in a worker and outside the database transaction. Provider outages therefore do not undo a committed purchase. Existing volumes require a numbered migration because MySQL init scripts only run for an empty data directory. See [`10-shipping-integration.md`](10-shipping-integration.md) for the schema contract and migration requirements.


For the local/test provider's API contract, including status simulation controls, see [`shipping-mock-openapi.yaml`](shipping-mock-openapi.yaml). Customer-facing UI requirements are in [`09-frontend.md`](09-frontend.md).

## 12. Payments and purchase gating

Wallet balance changes only through a completed top-up or a committed purchase. A top-up is created in `PENDING`, calls the payment mock outside a transaction, and atomically changes to `COMPLETED` with the wallet credit. Ambiguous provider outcomes remain `UNKNOWN` and must not be credited until recovery verifies the provider result. See [`11-payment-integration.md`](11-payment-integration.md).

Before a purchase, the service asks the KYC API for the account's level and review status: an account under review (`PENDING_REVIEW`) is refused (`KYC_PENDING_REVIEW`), otherwise the level must reach the listing's `required_kyc_level` (1 for every Pokémon and ordinary item, 2 for the Master tier; level 0 buys nothing). A failure leaves wallet, stock, inventory, purchase history, and shipment state unchanged. `POST /api/items/purchases` owns item purchases; it does not create a shipment. See [`12-kyc.md`](12-kyc.md).
