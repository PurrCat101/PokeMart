# Database

MySQL initializes `schema/` and `seed/` only on a fresh Docker volume. The deterministic baseline contains Generation I Pokémon IDs 1-151 sourced from the PokeAPI REST API v2. Reference fields include source ID, name, base experience, types, and default front sprite URL; normal startup and tests do not call PokéAPI.

The SQL seed is the pinned local snapshot retrieved on 2026-10-17. Price is derived from API `base_experience` as `150 + 2 × base_experience`, rounded to the nearest 50 and clamped to 200-1500. Stock decreases as base experience rises (20-40 for <=50, 12-24 for <=100, 6-14 for <=150, 2-8 above 150); a stable source-ID formula selects the value within each tier. This makes the sample catalog varied while keeping fresh database runs reproducible. Base experience is retained in the reference table but is not part of catalog responses. Price and stock are fictional PokéMart-owned values, not PokéAPI data.

PokeAPI data: [PokeAPI REST API](https://pokeapi.co/) and [PokeAPI project](https://github.com/PokeAPI/pokeapi). Review the applicable license and attribution terms before redistributing or publishing the snapshot.

Existing volumes created before the user-identity rename must have `database/migrations/001_rename_player_identity.sql` applied once. A fresh volume uses the updated schema and does not need this migration.

Existing volumes that contain the retired `idempotency_keys` table must also apply `database/migrations/002_drop_idempotency_keys.sql` once. New volumes do not create that table.

`make db-reset` deletes the local Compose volume and is destructive. It must never be used for shared or production data.
