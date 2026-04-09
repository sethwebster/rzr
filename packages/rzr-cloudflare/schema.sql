PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email_hmac TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  redirect_uri TEXT,
  cli_login_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS magic_links_user_idx ON magic_links(user_id);
CREATE INDEX IF NOT EXISTS magic_links_expires_idx ON magic_links(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);

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

CREATE TABLE IF NOT EXISTS gateway_sessions (
  slug TEXT PRIMARY KEY,
  user_id TEXT,
  public_url TEXT NOT NULL,
  upstream TEXT NOT NULL,
  target TEXT,
  provider TEXT,
  claimed_label TEXT,
  claimed_at TEXT,
  hostname_kind TEXT NOT NULL DEFAULT 'generated',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_available_at TEXT NOT NULL,
  released_at TEXT,
  session_token TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gateway_sessions_user_idx ON gateway_sessions(user_id, last_available_at DESC);
CREATE INDEX IF NOT EXISTS gateway_sessions_hostname_kind_idx ON gateway_sessions(user_id, hostname_kind, released_at);

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS billing_customers_provider_customer_idx ON billing_customers(provider_customer_id);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  provider_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  provider_price_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_user_idx ON billing_subscriptions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx ON billing_subscriptions(provider_customer_id);

CREATE TABLE IF NOT EXISTS entitlement_snapshots (
  user_id TEXT PRIMARY KEY,
  billing_provider TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  plan_code TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  reserved_hostname_limit INTEGER NOT NULL DEFAULT 0,
  ephemeral_named_limit INTEGER NOT NULL DEFAULT 0,
  custom_domain_enabled INTEGER NOT NULL DEFAULT 0,
  enterprise_flag INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hostname_reservations (
  hostname TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  released_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hostname_reservations_user_idx ON hostname_reservations(user_id, released_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  received_at TEXT NOT NULL
);
