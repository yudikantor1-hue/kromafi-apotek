-- Reference lists for the Lemari, Metode pembayaran, Dokter, and Distributor
-- screens, plus the single-row pharmacy profile.
--
-- Every list carries the same offline-sync columns as `items`: the device
-- creates the id, `version` detects concurrent edits, and the two timestamps
-- decide which device-reported change wins (10.2.7).

CREATE TABLE IF NOT EXISTS cabinets (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cabinets_nama_unique ON cabinets (nama COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cabinets_server_updated ON cabinets (server_updated_at);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_nama_unique ON payment_methods (nama COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_payment_methods_server_updated ON payment_methods (server_updated_at);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_nama_unique ON doctors (nama COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_doctors_server_updated ON doctors (server_updated_at);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Aktif', 'Tidak aktif')),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_nama_unique ON suppliers (nama COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_suppliers_server_updated ON suppliers (server_updated_at);

-- One row serves the single pharmacy this installation belongs to, so the
-- fixed id makes a second profile impossible. The row is created here so an
-- update (not an insert) is the only write path after deployment.
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  nama_apotek TEXT NOT NULL DEFAULT '',
  alamat TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

INSERT OR IGNORE INTO settings
  (id, nama_apotek, alamat, version, device_updated_at, server_updated_at, created_at, updated_by)
VALUES
  ('apotek', '', '', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'server');
