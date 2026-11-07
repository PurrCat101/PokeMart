SET NAMES utf8mb4;

-- Purchase history is now one list across Pokémon and items (GET /purchases, optionally filtered by
-- kind). The per-kind index from migration 008 only serves the filtered query, so add back the
-- user-and-time index that serves the unfiltered, newest-first list.
ALTER TABLE purchases
  ADD INDEX idx_purchase_user_created (user_id, created_at DESC, id DESC);
