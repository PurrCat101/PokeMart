CREATE TABLE pokemon_reference (
  source_id INT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  base_experience SMALLINT UNSIGNED NOT NULL,
  types JSON NOT NULL,
  sprite_url VARCHAR(512) NULL
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
  CONSTRAINT chk_wallet_balance CHECK (balance >= 0)
);

CREATE TABLE user_inventory (
  user_id VARCHAR(64) NOT NULL,
  pokemon_source_id INT NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (user_id, pokemon_source_id),
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
  CONSTRAINT fk_purchase_pokemon FOREIGN KEY (pokemon_source_id) REFERENCES pokemon_reference(source_id),
  CONSTRAINT chk_purchase_quantity CHECK (quantity BETWEEN 1 AND 99),
  INDEX idx_purchase_user_created (user_id, created_at DESC, id DESC)
);
