-- Test accounts for the concurrency-safety scenarios (RACE-*). One account per test case.
-- Same lab demo password as the other lab-kyc-* accounts; the test sets the KYC level itself.
SET NAMES utf8mb4;

-- two concurrent level-0 purchases are both refused
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-level-0', 'lab-kyc-race-level-0@example.test', 'KYC test: race-level-0', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-level-0', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- concurrent level-0 purchases leave the wallet untouched
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-level-0-wallet', 'lab-kyc-race-level-0-wallet@example.test', 'KYC test: race-level-0-wallet', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-level-0-wallet', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- two concurrent purchases cannot overdraw the wallet
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-wallet-drain', 'lab-kyc-race-wallet-drain@example.test', 'KYC test: race-wallet-drain', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-wallet-drain', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- wallet equals start minus price times successes
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-wallet-consistency', 'lab-kyc-race-wallet-consistency@example.test', 'KYC test: race-wallet-consistency', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-wallet-consistency', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- concurrent purchases never oversell stock
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-stock-depletion', 'lab-kyc-race-stock-depletion@example.test', 'KYC test: race-stock-depletion', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-stock-depletion', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- concurrent purchases beyond the stock fail with INSUFFICIENT_STOCK
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-stock-limit', 'lab-kyc-race-stock-limit@example.test', 'KYC test: race-stock-limit', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-stock-limit', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- same purchase ID cannot be processed twice
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-duplicate-id', 'lab-kyc-race-duplicate-id@example.test', 'KYC test: race-duplicate-id', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-duplicate-id', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);

-- KYC level is enforced inside the purchase
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-race-kyc-timing', 'lab-kyc-race-kyc-timing@example.test', 'KYC test: race-kyc-timing', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-race-kyc-timing', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
