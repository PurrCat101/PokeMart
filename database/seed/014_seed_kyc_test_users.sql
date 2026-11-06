-- Test accounts for the KYC scenarios. One account per test case, so cases never share data.
-- All use the lab demo password. The KYC level/status of each account is set by the test itself
-- (PUT /__test/users/{userId} on the KYC service); unknown accounts default to level 0 / ACTIVE.
SET NAMES utf8mb4;

-- level 0 cannot buy a Pokémon
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-none-pokemon', 'lab-kyc-none-pokemon@example.test', 'KYC test: none-pokemon', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-none-pokemon', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- level 0 cannot buy an ordinary item
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-none-item', 'lab-kyc-none-item@example.test', 'KYC test: none-item', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-none-item', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- level 1 buys a Pokémon
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-basic-pokemon', 'lab-kyc-basic-pokemon@example.test', 'KYC test: basic-pokemon', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-basic-pokemon', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- level 1 buys an ordinary item
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-basic-item', 'lab-kyc-basic-item@example.test', 'KYC test: basic-item', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-basic-item', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- level 1 cannot buy a Master item
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-basic-master', 'lab-kyc-basic-master@example.test', 'KYC test: basic-master', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-basic-master', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- level 2 buys a Master item
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-full-master', 'lab-kyc-full-master@example.test', 'KYC test: full-master', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-full-master', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- under review cannot buy a Pokémon
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-pending-pokemon', 'lab-kyc-pending-pokemon@example.test', 'KYC test: pending-pokemon', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-pending-pokemon', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- under review cannot buy an item
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-pending-item', 'lab-kyc-pending-item@example.test', 'KYC test: pending-item', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-pending-item', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- under review beats a sufficient level
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-basic-pending', 'lab-kyc-basic-pending@example.test', 'KYC test: basic-pending', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-basic-pending', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- rejected account cannot buy a Pokémon
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-rejected-pokemon', 'lab-kyc-rejected-pokemon@example.test', 'KYC test: rejected-pokemon', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-rejected-pokemon', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- GET status and account-info for level 0
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-status-none', 'lab-kyc-status-none@example.test', 'KYC test: status-none', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-status-none', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- GET status and account-info for level 1
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-status-basic', 'lab-kyc-status-basic@example.test', 'KYC test: status-basic', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-status-basic', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- GET status and account-info for level 2
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-status-full', 'lab-kyc-status-full@example.test', 'KYC test: status-full', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-status-full', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- GET status and account-info while under review
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-status-pending', 'lab-kyc-status-pending@example.test', 'KYC test: status-pending', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-status-pending', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- GET status and account-info after rejection
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-status-rejected', 'lab-kyc-status-rejected@example.test', 'KYC test: status-rejected', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-status-rejected', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- valid submission becomes PENDING_REVIEW
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-valid', 'lab-kyc-submit-valid@example.test', 'KYC test: submit-valid', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-valid', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- invalid submission returns field errors
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-invalid', 'lab-kyc-submit-invalid@example.test', 'KYC test: submit-invalid', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-invalid', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- unknown fields and wrong types are rejected
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-malformed', 'lab-kyc-submit-malformed@example.test', 'KYC test: submit-malformed', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-malformed', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- second submission while pending is rejected
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-duplicate', 'lab-kyc-submit-duplicate@example.test', 'KYC test: submit-duplicate', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-duplicate', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- verified account cannot submit again
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-verified', 'lab-kyc-submit-verified@example.test', 'KYC test: submit-verified', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-verified', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- rejected account can submit again
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-submit-resubmit', 'lab-kyc-submit-resubmit@example.test', 'KYC test: submit-resubmit', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-submit-resubmit', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- approval unlocks purchasing
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-approve-flow', 'lab-kyc-approve-flow@example.test', 'KYC test: approve-flow', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-approve-flow', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- KYC outage fails a purchase closed
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-down-purchase', 'lab-kyc-down-purchase@example.test', 'KYC test: down-purchase', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-down-purchase', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- KYC outage returns kyc null in account-info
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-down-account', 'lab-kyc-down-account@example.test', 'KYC test: down-account', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-down-account', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- UI popup can be dismissed with Maybe later
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-ui-later', 'lab-kyc-ui-later@example.test', 'KYC test: ui-later', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-ui-later', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- UI Verify now leads to the form and submit
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-ui-verify', 'lab-kyc-ui-verify@example.test', 'KYC test: ui-verify', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-ui-verify', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- UI form shows validation errors
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-ui-validation', 'lab-kyc-ui-validation@example.test', 'KYC test: ui-validation', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-ui-validation', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- UI shows the under-review banner
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-ui-pending', 'lab-kyc-ui-pending@example.test', 'KYC test: ui-pending', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-ui-pending', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
-- UI shows the rejected banner and Send again
INSERT INTO users (user_id, email, display_name, password_hash, is_active) VALUES ('lab-kyc-ui-rejected', 'lab-kyc-ui-rejected@example.test', 'KYC test: ui-rejected', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name), is_active = VALUES(is_active);
INSERT INTO user_wallet (user_id, balance) VALUES ('lab-kyc-ui-rejected', 100000) ON DUPLICATE KEY UPDATE balance = VALUES(balance);
