SET NAMES utf8mb4;

ALTER TABLE shop_listing
  ADD COLUMN required_kyc_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_listing_kyc CHECK (required_kyc_level BETWEEN 0 AND 2);

CREATE TABLE item_reference (
  source_id INT PRIMARY KEY, name VARCHAR(128) NOT NULL UNIQUE, pokeapi_cost INT UNSIGNED NOT NULL DEFAULT 0, category VARCHAR(128) NULL, sprite_url VARCHAR(512) NULL
);
CREATE TABLE item_listing (
  item_source_id INT PRIMARY KEY, price INT NOT NULL, stock INT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, required_kyc_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_item_listing_reference FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id),
  CONSTRAINT chk_item_listing_price CHECK (price >= 0), CONSTRAINT chk_item_listing_stock CHECK (stock >= 0), CONSTRAINT chk_item_listing_kyc CHECK (required_kyc_level BETWEEN 0 AND 2)
);
CREATE TABLE user_item_inventory (
  user_id VARCHAR(64) NOT NULL, item_source_id INT NOT NULL, quantity INT NOT NULL, PRIMARY KEY (user_id, item_source_id),
  CONSTRAINT fk_item_inventory_user FOREIGN KEY (user_id) REFERENCES users(user_id), CONSTRAINT fk_item_inventory_item FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id), CONSTRAINT chk_item_inventory_quantity CHECK (quantity > 0)
);
CREATE TABLE top_ups (
  top_up_id CHAR(36) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, amount_baht INT UNSIGNED NOT NULL, status ENUM('PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'PENDING', provider_payment_id VARCHAR(128) NULL, last_error_code VARCHAR(64) NULL, attempt_count INT UNSIGNED NOT NULL DEFAULT 0, next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), claimed_until TIMESTAMP(3) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_top_up_user FOREIGN KEY (user_id) REFERENCES users(user_id), CONSTRAINT chk_top_up_amount CHECK (amount_baht BETWEEN 1 AND 10000), INDEX idx_top_up_due_work (status, next_attempt_at), INDEX idx_top_up_lease (status, claimed_until)
);
