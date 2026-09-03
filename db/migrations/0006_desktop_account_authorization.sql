CREATE TABLE IF NOT EXISTS desktop_authorizations (
  id TEXT PRIMARY KEY NOT NULL,
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code_hash TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  app_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS desktop_authorizations_expiry_idx
  ON desktop_authorizations(status, expires_at);

CREATE INDEX IF NOT EXISTS desktop_authorizations_owner_idx
  ON desktop_authorizations(user_id, created_at);
