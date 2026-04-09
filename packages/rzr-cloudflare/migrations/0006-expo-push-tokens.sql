CREATE TABLE IF NOT EXISTS expo_push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS expo_push_user_device ON expo_push_tokens(user_id, device_id);
CREATE INDEX IF NOT EXISTS expo_push_user ON expo_push_tokens(user_id);
