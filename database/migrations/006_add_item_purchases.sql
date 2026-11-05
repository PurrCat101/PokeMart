CREATE TABLE item_purchases (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  item_source_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price INT NOT NULL,
  total_price INT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_item_purchase_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_item_purchase_item FOREIGN KEY (item_source_id) REFERENCES item_reference(source_id),
  CONSTRAINT chk_item_purchase_quantity CHECK (quantity BETWEEN 1 AND 99),
  INDEX idx_item_purchase_user_created (user_id, created_at DESC, id DESC)
);
