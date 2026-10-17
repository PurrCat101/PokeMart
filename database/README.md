# Database

MySQL initializes `schema/` and `seed/` only on a fresh Docker volume. The deterministic baseline contains Generation I Pokémon IDs 1-151 sourced from the PokeAPI REST API v2. Reference fields include source ID, name, base experience, types, and default front sprite URL; normal startup and tests do not call PokéAPI.

## Schema and relationships

![PokéMart MySQL entity relationship diagram](schema/erd.svg)

The diagram reflects the physical schema in [`schema/001_create_shop_tables.sql`](schema/001_create_shop_tables.sql). `pokemon_reference` is the shared catalog; a listing may be present for each catalog Pokémon, while inventory and purchase rows refer back to that Pokémon. The arrows label cardinality from `pokemon_reference` to the related table.

### Open or edit the ERD in dbdiagram.io

The copyable DBML source is [`schema/pokemart.dbml`](schema/pokemart.dbml). In dbdiagram.io, create a diagram, then copy and paste the complete contents of that file into the editor. The named `Ref` lines are the actual foreign keys from the SQL schema; `user_id` is documented as a logical association and intentionally has no `Ref`.

### Columns and keys

| Table | Column | MySQL type | Null | Key / rule |
|---|---|---|---|---|
| `pokemon_reference` | `source_id` | `INT` | No | PK |
| | `name` | `VARCHAR(64)` | No | UNIQUE |
| | `base_experience` | `SMALLINT UNSIGNED` | No | |
| | `types` | `JSON` | No | |
| | `sprite_url` | `VARCHAR(512)` | Yes | |
| `shop_listing` | `pokemon_source_id` | `INT` | No | PK, FK → `pokemon_reference.source_id` |
| | `price` | `INT` | No | CHECK `price >= 0` |
| | `stock` | `INT` | No | CHECK `stock >= 0` |
| | `active` | `BOOLEAN` | No | DEFAULT `TRUE` |
| `user_wallet` | `user_id` | `VARCHAR(64)` | No | PK |
| | `balance` | `INT` | No | CHECK `balance >= 0` |
| `user_inventory` | `user_id` | `VARCHAR(64)` | No | Composite PK |
| | `pokemon_source_id` | `INT` | No | Composite PK, FK → `pokemon_reference.source_id` |
| | `quantity` | `INT` | No | CHECK `quantity > 0` |
| `purchases` | `id` | `CHAR(36)` | No | PK; client-generated UUID |
| | `user_id` | `VARCHAR(64)` | No | Included in `idx_purchase_user_created` |
| | `pokemon_source_id` | `INT` | No | FK → `pokemon_reference.source_id` |
| | `quantity` | `INT` | No | CHECK 1–99 |
| | `unit_price` | `INT` | No | Price snapshot |
| | `total_price` | `INT` | No | Price snapshot |
| | `created_at` | `TIMESTAMP(3)` | No | DEFAULT `CURRENT_TIMESTAMP(3)` |

The remaining index columns are `created_at DESC, id DESC` in `idx_purchase_user_created`. The composite inventory primary key is `(user_id, pokemon_source_id)`.

**Important:** the only declared foreign keys point to `pokemon_reference`. The shared `user_id` columns are logical associations for this lab, not enforced relationships to a user table. Purchase prices are snapshots; a purchase does not reference a shop listing. The schema has no `idempotency_keys` table: a committed purchase ID is protected by the `purchases` primary key.

The SQL seed is the pinned local snapshot retrieved on 2026-10-17. Price is derived from API `base_experience` as `150 + 2 × base_experience`, rounded to the nearest 50 and clamped to 200-1500. Stock decreases as base experience rises (20-40 for <=50, 12-24 for <=100, 6-14 for <=150, 2-8 above 150); a stable source-ID formula selects the value within each tier. This makes the sample catalog varied while keeping fresh database runs reproducible. Base experience is retained in the reference table but is not part of catalog responses. Price and stock are fictional PokéMart-owned values, not PokéAPI data.

PokeAPI data: [PokeAPI REST API](https://pokeapi.co/) and [PokeAPI project](https://github.com/PokeAPI/pokeapi). Review the applicable license and attribution terms before redistributing or publishing the snapshot.

Existing volumes created before the user-identity rename must have `database/migrations/001_rename_player_identity.sql` applied once. A fresh volume uses the updated schema and does not need this migration.

Existing volumes that contain the retired `idempotency_keys` table must also apply `database/migrations/002_drop_idempotency_keys.sql` once. New volumes do not create that table.

`make db-reset` deletes the local Compose volume and is destructive. It must never be used for shared or production data.
