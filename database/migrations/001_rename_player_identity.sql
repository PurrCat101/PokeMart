RENAME TABLE player_wallet TO user_wallet, player_inventory TO user_inventory;

ALTER TABLE user_wallet
  RENAME COLUMN player_id TO user_id;

ALTER TABLE user_inventory
  RENAME COLUMN player_id TO user_id;

ALTER TABLE purchases
  RENAME COLUMN player_id TO user_id,
  RENAME INDEX idx_purchase_player_created TO idx_purchase_user_created;

ALTER TABLE idempotency_keys
  RENAME COLUMN player_id TO user_id,
  RENAME INDEX uq_player_idem TO uq_user_idem;

UPDATE user_wallet SET user_id = 'lab-user-001' WHERE user_id = 'lab-player-001';
UPDATE user_inventory SET user_id = 'lab-user-001' WHERE user_id = 'lab-player-001';
UPDATE purchases SET user_id = 'lab-user-001' WHERE user_id = 'lab-player-001';
UPDATE idempotency_keys SET user_id = 'lab-user-001' WHERE user_id = 'lab-player-001';

ALTER TABLE pokemon_reference
  ADD COLUMN base_experience SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER name;
