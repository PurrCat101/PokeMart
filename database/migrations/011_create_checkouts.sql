SET NAMES utf8mb4;

-- A checkout buys a whole bag in one transaction (POST /checkouts). Its client-generated checkoutId is the
-- idempotency key and the order id: a retry with the same id and the same bag gets the stored response back,
-- the same id with a different bag is refused, and every purchase of the bag points at it.
-- Rows are inserted inside the checkout transaction, so a rejected checkout leaves no row and its id stays usable.
CREATE TABLE checkouts (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_checkout_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- NULL for purchases made one at a time through POST /purchases and for rows that predate this migration.
ALTER TABLE purchases
  ADD COLUMN checkout_id CHAR(36) NULL,
  ADD INDEX idx_purchase_checkout (checkout_id),
  ADD CONSTRAINT fk_purchase_checkout FOREIGN KEY (checkout_id) REFERENCES checkouts(id);
