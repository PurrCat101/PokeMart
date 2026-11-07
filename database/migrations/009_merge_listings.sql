SET NAMES utf8mb4;

-- Schema audit, part 2: shop_listing and item_listing had identical columns (price, stock, active,
-- required_kyc_level) and identical CHECKs; only the reference they point to differed. Fold them into
-- one `listings` table the same way migration 008 folded inventory: two nullable product columns, a
-- CHECK that exactly one is set, and one unique key per product type (NULLs never collide).
--
-- Columns keep their names, so queries only change the table name. Constraint names are new because
-- MySQL requires them to be unique per schema and the old tables still exist while rows are copied.
-- Not atomic (DDL commits implicitly): back up first, see database/README.md.

CREATE TABLE listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pokemon_source_id INT NULL,
  item_source_id INT NULL,
  price INT NOT NULL,
  stock INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  required_kyc_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_listings_pokemon (pokemon_source_id),
  UNIQUE KEY uq_listings_item (item_source_id),
  CONSTRAINT fk_listings_pokemon FOREIGN KEY (pokemon_source_id) REFERENCES pokemon_reference(source_id),
  CONSTRAINT fk_listings_item FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id),
  CONSTRAINT chk_listings_one_product CHECK ((pokemon_source_id IS NULL) <> (item_source_id IS NULL)),
  CONSTRAINT chk_listings_price CHECK (price >= 0),
  CONSTRAINT chk_listings_stock CHECK (stock >= 0),
  CONSTRAINT chk_listings_kyc CHECK (required_kyc_level BETWEEN 0 AND 2)
);

INSERT INTO listings (pokemon_source_id, item_source_id, price, stock, active, required_kyc_level)
SELECT pokemon_source_id, NULL, price, stock, active, required_kyc_level FROM shop_listing;

INSERT INTO listings (pokemon_source_id, item_source_id, price, stock, active, required_kyc_level)
SELECT NULL, item_source_id, price, stock, active, required_kyc_level FROM item_listing;

DROP TABLE shop_listing;
DROP TABLE item_listing;
