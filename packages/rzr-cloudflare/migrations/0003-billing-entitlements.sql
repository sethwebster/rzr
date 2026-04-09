ALTER TABLE gateway_sessions ADD COLUMN hostname_kind TEXT NOT NULL DEFAULT 'generated';

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
