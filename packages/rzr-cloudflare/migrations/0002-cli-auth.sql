ALTER TABLE magic_links ADD COLUMN cli_login_id TEXT;

CREATE TABLE IF NOT EXISTS cli_logins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  poll_token_hash TEXT NOT NULL UNIQUE,
  session_token TEXT,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  fetched_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cli_logins_user_idx ON cli_logins(user_id);
CREATE INDEX IF NOT EXISTS cli_logins_expires_idx ON cli_logins(expires_at);
