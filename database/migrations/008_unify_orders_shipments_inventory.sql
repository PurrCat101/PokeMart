SET NAMES utf8mb4;

-- Schema audit: Pokémon and item data were stored in twin tables that differed only by the product
-- column. This migration folds each pair into one table (13 -> 10 tables):
--
--   purchases + item_purchases          -> purchases   (one row per order, exactly one product column set)
--   shipments + item_shipments          -> shipments   (already keyed by purchases.id, so no FK change)
--   user_inventory + user_item_inventory -> user_inventory
--
-- Catalog tables (pokemon_reference/item_reference and the two listings) stay separate: their
-- columns and foreign keys really are different.
--
-- DDL commits implicitly in MySQL, so this file is not atomic. Run it once (Liquibase changeset 010
-- does) against a database that is at migration 007; if a statement fails, restore and retry.

-- 1. purchases: add the item product column next to the Pokémon one ------------------------------------

ALTER TABLE purchases
  MODIFY pokemon_source_id INT NULL,
  ADD COLUMN item_source_id INT NULL AFTER pokemon_source_id,
  ADD COLUMN kind ENUM('POKEMON', 'ITEM')
    GENERATED ALWAYS AS (IF(pokemon_source_id IS NULL, 'ITEM', 'POKEMON')) STORED NOT NULL AFTER item_source_id,
  ADD CONSTRAINT fk_purchase_item FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id),
  ADD CONSTRAINT chk_purchase_one_product CHECK ((pokemon_source_id IS NULL) <> (item_source_id IS NULL)),
  ADD CONSTRAINT chk_purchase_total CHECK (total_price = unit_price * quantity);

-- Order history is always listed per kind, newest first. This index serves that query and still
-- gives fk_purchase_user the user_id-leading index it needs, so the old per-user index can go.
ALTER TABLE purchases
  ADD INDEX idx_purchase_user_kind_created (user_id, kind, created_at DESC, id DESC),
  DROP INDEX idx_purchase_user_created;

INSERT INTO purchases (id, user_id, pokemon_source_id, item_source_id, quantity, unit_price, total_price, created_at)
SELECT id, user_id, NULL, item_source_id, quantity, unit_price, total_price, created_at FROM item_purchases;

-- 2. shipments: move the item shipments over (purchase_id already references purchases.id) -------------

INSERT INTO shipments (
  purchase_id, processing_status, delivery_status, provider_shipment_id, tracking_number, attempt_count,
  next_attempt_at, claimed_until, last_error_code, last_error_message, created_at, updated_at
)
SELECT
  purchase_id, processing_status, delivery_status, provider_shipment_id, tracking_number, attempt_count,
  next_attempt_at, claimed_until, last_error_code, last_error_message, created_at, updated_at
FROM item_shipments;

-- 3. user_inventory: surrogate key, because a nullable product column cannot be part of a primary key ----
-- Uniqueness per kind comes from two unique keys; MySQL treats NULLs as distinct, so a Pokémon row
-- (item_source_id NULL) never collides with an item row.

ALTER TABLE user_inventory
  ADD UNIQUE KEY uq_inventory_user_pokemon (user_id, pokemon_source_id);

ALTER TABLE user_inventory
  DROP PRIMARY KEY,
  ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  MODIFY pokemon_source_id INT NULL,
  ADD COLUMN item_source_id INT NULL AFTER pokemon_source_id,
  ADD UNIQUE KEY uq_inventory_user_item (user_id, item_source_id),
  ADD CONSTRAINT fk_inventory_item FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id),
  ADD CONSTRAINT chk_inventory_one_product CHECK ((pokemon_source_id IS NULL) <> (item_source_id IS NULL));

INSERT INTO user_inventory (user_id, pokemon_source_id, item_source_id, quantity)
SELECT user_id, NULL, item_source_id, quantity FROM user_item_inventory;

-- 4. Drop the twins ----------------------------------------------------------------------------------

DROP TABLE item_shipments;
DROP TABLE user_item_inventory;
DROP TABLE item_purchases;
