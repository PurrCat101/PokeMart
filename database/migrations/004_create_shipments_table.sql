SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS shipments (
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
