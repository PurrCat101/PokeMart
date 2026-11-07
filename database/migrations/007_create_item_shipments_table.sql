SET NAMES utf8mb4;

-- Item purchases ship like Pokémon purchases. Same lifecycle as `shipments`, kept in its own
-- table so deleting an item purchase cascades to its shipment (the same guarantee Pokémon
-- purchases already have) without needing triggers.
CREATE TABLE IF NOT EXISTS item_shipments (
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
  CONSTRAINT fk_item_shipment_purchase FOREIGN KEY (purchase_id) REFERENCES item_purchases(id) ON DELETE CASCADE,
  CONSTRAINT chk_item_shipment_attempts CHECK (attempt_count >= 0),
  INDEX idx_item_shipment_due_work (processing_status, next_attempt_at),
  INDEX idx_item_shipment_lease (processing_status, claimed_until)
);

-- Orders placed before item shipping existed get a shipment too, so every order has a delivery status.
INSERT IGNORE INTO item_shipments (purchase_id, created_at, updated_at)
SELECT id, created_at, created_at FROM item_purchases;
