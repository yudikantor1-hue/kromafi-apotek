-- Cashier notas and their lines, plus the stock ledger every goods sale writes.
--
-- A nota is one document: a device sends it as a single sync operation and the
-- server writes the nota, its lines, and the stock effects together (10.2.28).
-- No numbering is generated: the id is a device-made UUID (10.2.25), the nota
-- is identified by that id alone, and the receipt prints no code.
--
-- Money is whole rupiah. Line amounts are rounded to the nearest rupiah when
-- the quantity is fractional, so totals always stay integers.

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  waktu TEXT NOT NULL,
  total_tagihan INTEGER NOT NULL,
  diskon_total_tagihan INTEGER NOT NULL DEFAULT 0,
  total_tagihan_final INTEGER NOT NULL,
  metode_pembayaran TEXT NOT NULL,
  bayar INTEGER NOT NULL DEFAULT 0,
  nama_pasien TEXT NOT NULL DEFAULT '',
  nama_dokter TEXT NOT NULL DEFAULT '',
  nama_petugas TEXT NOT NULL,
  catatan TEXT NOT NULL DEFAULT '',
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_tanggal ON sales (tanggal);
CREATE INDEX IF NOT EXISTS idx_sales_server_updated ON sales (server_updated_at);

-- The name, unit, and price are copied at transaction time (10.1.14), so later
-- catalogue edits never rewrite a nota a customer already holds.
CREATE TABLE IF NOT EXISTS sale_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  item_id TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('barang', 'jasa')),
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT '',
  harga_jual INTEGER NOT NULL,
  jumlah REAL NOT NULL,
  diskon_tagihan INTEGER NOT NULL DEFAULT 0,
  tagihan INTEGER NOT NULL,
  tagihan_final INTEGER NOT NULL,
  harga_jual_final REAL NOT NULL,
  batch TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines (sale_id);

-- One row per stock change. A goods sale writes one row per line and the server
-- decrements items.stok with it (10.2.27), so two devices add up instead of
-- overwriting each other.
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  sale_id TEXT,
  jenis TEXT NOT NULL,
  jumlah REAL NOT NULL,
  stok_setelah REAL NOT NULL,
  device_time TEXT NOT NULL,
  server_time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements (item_id, server_time);
