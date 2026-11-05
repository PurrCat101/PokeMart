-- Local trainer accounts only. Pokémon and item reference/listing data live in
-- 010_reference_pokemon.sql, 011_reference_items.sql, and 012_seed_catalog.sql.
SET NAMES utf8mb4;

INSERT INTO users (user_id, email, display_name, password_hash, is_active)
VALUES (
  'lab-user-001',
  'lab-user-001@example.test',
  'PokéMart Lab User',
  'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA',
  TRUE
), (
  'lab-empty-user-001',
  'empty-user-001@example.invalid',
  'PokéMart Test User Without Wallet',
  NULL,
  TRUE
)
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  display_name = VALUES(display_name),
  is_active = VALUES(is_active);

INSERT INTO user_wallet (user_id, balance) VALUES ('lab-user-001', 10000)
ON DUPLICATE KEY UPDATE balance = VALUES(balance);

