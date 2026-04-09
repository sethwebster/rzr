CREATE TABLE IF NOT EXISTS live_activity_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS la_tokens_user_device ON live_activity_tokens(user_id, device_id);
CREATE INDEX IF NOT EXISTS la_tokens_user ON live_activity_tokens(user_id);
