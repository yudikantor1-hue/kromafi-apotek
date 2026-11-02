-- Kromafi Apotek — first slice schema (Barang vertical slice).
-- D1 is the authoritative shared database. Every offline edit reaches it as a
-- sync operation with a stable operation id so retries are safe.

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staf')),
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_staff ON sessions (staff_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  attempt_count INTEGER NOT NULL,
  first_attempt_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL,
  harga_modal INTEGER NOT NULL,
  harga_jual INTEGER NOT NULL,
  stok REAL NOT NULL DEFAULT 0,
  lemari TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_nama_unique ON items (nama COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_items_server_updated ON items (server_updated_at);

-- Every accepted, superseded, conflicting, or rejected edit stays visible.
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'superseded', 'conflict', 'rejected')),
  staff_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  device_time TEXT NOT NULL,
  server_time TEXT NOT NULL,
  base_version INTEGER,
  resulting_version INTEGER,
  before_json TEXT,
  after_json TEXT,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events (entity, entity_id, server_time);

-- One row per sync operation: the idempotency ledger.
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  device_time TEXT NOT NULL,
  server_time TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  response_json TEXT NOT NULL DEFAULT '{}'
);
