CREATE TABLE IF NOT EXISTS random_numbers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  value INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS magic_link_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NULL,
  otp_hash CHAR(64) NULL,
  request_token_hash CHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  error_message TEXT NULL,
  INDEX idx_magic_link_requests_email (email),
  INDEX idx_magic_link_requests_status (status),
  INDEX idx_magic_link_requests_code_hash (code_hash),
  INDEX idx_magic_link_requests_request_token_hash (request_token_hash)
);

CREATE TABLE IF NOT EXISTS magic_link_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  request_id BIGINT UNSIGNED NOT NULL,
  session_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_magic_link_sessions_email (email),
  INDEX idx_magic_link_sessions_session_hash (session_hash),
  CONSTRAINT fk_magic_link_sessions_request
    FOREIGN KEY (request_id) REFERENCES magic_link_requests(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_statuses_email (email),
  INDEX idx_payment_statuses_is_paid (is_paid)
);
