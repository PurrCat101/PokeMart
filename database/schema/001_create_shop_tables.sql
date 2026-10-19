CREATE TABLE pokemon_reference (
  source_id INT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  base_experience SMALLINT UNSIGNED NOT NULL,
  types JSON NOT NULL,
  sprite_url VARCHAR(512) NULL
);

CREATE TABLE users (
  user_id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE shop_listing (
  pokemon_source_id INT PRIMARY KEY,
  price INT NOT NULL,
  stock INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_listing_pokemon FOREIGN KEY (pokemon_source_id) REFERENCES pokemon_reference(source_id),
  CONSTRAINT chk_listing_price CHECK (price >= 0),
  CONSTRAINT chk_listing_stock CHECK (stock >= 0)
);

CREATE TABLE user_wallet (
  user_id VARCHAR(64) PRIMARY KEY,
  balance INT NOT NULL,
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT chk_wallet_balance CHECK (balance >= 0)
);

CREATE TABLE user_inventory (
  user_id VARCHAR(64) NOT NULL,
  pokemon_source_id INT NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (user_id, pokemon_source_id),
  CONSTRAINT fk_inventory_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_inventory_pokemon FOREIGN KEY (pokemon_source_id) REFERENCES pokemon_reference(source_id),
  CONSTRAINT chk_inventory_quantity CHECK (quantity > 0)
);

CREATE TABLE purchases (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  pokemon_source_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price INT NOT NULL,
  total_price INT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_purchase_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_purchase_pokemon FOREIGN KEY (pokemon_source_id) REFERENCES pokemon_reference(source_id),
  CONSTRAINT chk_purchase_quantity CHECK (quantity BETWEEN 1 AND 99),
  INDEX idx_purchase_user_created (user_id, created_at DESC, id DESC)
);

CREATE TABLE shipments (
  purchase_id CHAR(36) PRIMARY KEY,
  processing_status ENUM('PENDING', 'PROCESSING', 'RETRY_WAIT', 'LABEL_CREATED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'PENDING',
  delivery_status ENUM('WAITING_FOR_SHIPMENT', 'LABEL_CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED') NOT NULL DEFAULT 'WAITING_FOR_SHIPMENT',
  provider_shipment_id VARCHAR(128) NULL,
  tracking_number VARCHAR(128) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claimed_until TIMESTAMP(3) NULL,
  last_error_code VARCHAR(64) NULL,
  last_error_message VARCHAR(512) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_shipment_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT chk_shipment_attempts CHECK (attempt_count >= 0),
  INDEX idx_shipment_due_work (processing_status, next_attempt_at),
  INDEX idx_shipment_lease (processing_status, claimed_until)
);

