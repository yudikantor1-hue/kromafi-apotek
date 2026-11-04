-- Supplier invoices recorded on the Faktur orderan menu (10.2.33-10.2.39).
-- Money is whole rupiah except the unit purchase price, which the prototype
-- stores with decimals (10.000 per box of 20 becomes 499,5 per unit).
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  nomor_faktur TEXT NOT NULL,
  distributor_id TEXT NOT NULL,
  distributor_nama TEXT NOT NULL,
  tanggal_faktur TEXT NOT NULL,
  jatuh_tempo TEXT NOT NULL,
  status_pelunasan TEXT NOT NULL CHECK (status_pelunasan IN ('Belum lunas', 'Lunas')),
  tanggal_pelunasan TEXT,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  total_tagihan INTEGER NOT NULL,
  petugas_id TEXT NOT NULL,
  petugas_nama TEXT NOT NULL,
  catatan TEXT NOT NULL DEFAULT '',
  waktu TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  device_updated_at TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_tanggal ON purchase_invoices (tanggal_faktur);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_jatuh_tempo ON purchase_invoices (jatuh_tempo);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_distributor ON purchase_invoices (distributor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_server_updated ON purchase_invoices (server_updated_at);

-- Batch and expiry live on the line, not in a per-batch stock table (10.2.36).
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT '',
  kemasan TEXT NOT NULL CHECK (kemasan IN ('satu unit', 'per box')),
  jumlah_box REAL NOT NULL DEFAULT 0,
  isi_per_box REAL NOT NULL DEFAULT 0,
  jumlah REAL NOT NULL,
  harga_beli INTEGER NOT NULL,
  diskon_persen REAL NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  harga_modal REAL NOT NULL,
  margin_persen REAL NOT NULL DEFAULT 0,
  harga_jual INTEGER NOT NULL,
  tagihan INTEGER NOT NULL,
  batch TEXT NOT NULL DEFAULT '',
  tanggal_expired TEXT,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice ON purchase_invoice_lines (invoice_id, urutan);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_item ON purchase_invoice_lines (item_id);

-- Receipts and their corrections share the stock ledger with sales (10.2.29).
ALTER TABLE stock_movements ADD COLUMN purchase_invoice_id TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice ON stock_movements (purchase_invoice_id);
