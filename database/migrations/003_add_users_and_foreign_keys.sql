SET NAMES utf8mb4;

CREATE TABLE users (
  user_id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

INSERT INTO users (user_id, email, display_name, password_hash, is_active)
SELECT
  existing.user_id,
  CASE
    WHEN existing.user_id = 'lab-user-001' THEN 'lab-user-001@example.test'
    WHEN existing.user_id = 'lab-empty-user-001' THEN 'empty-user-001@example.invalid'
    ELSE CONCAT('legacy-', LOWER(SHA2(existing.user_id, 256)), '@example.invalid')
  END,
  CASE
    WHEN existing.user_id = 'lab-user-001' THEN 'PokéMart Lab User'
    WHEN existing.user_id = 'lab-empty-user-001' THEN 'PokéMart Test User Without Wallet'
    ELSE CONCAT('Imported user ', existing.user_id)
  END,
  CASE
    WHEN existing.user_id = 'lab-user-001' THEN 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA'
    ELSE NULL
  END,
  TRUE
FROM (
  SELECT user_id FROM user_wallet
  UNION
  SELECT user_id FROM user_inventory
  UNION
  SELECT user_id FROM purchases
  UNION
  SELECT 'lab-empty-user-001'
) AS existing;

ALTER TABLE user_wallet
  ADD CONSTRAINT fk_wallet_user
  FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE user_inventory
  ADD CONSTRAINT fk_inventory_user
  FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE purchases
  ADD CONSTRAINT fk_purchase_user
  FOREIGN KEY (user_id) REFERENCES users(user_id);
