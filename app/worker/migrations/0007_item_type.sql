-- One catalogue for goods and services (10.2.16). Existing rows are goods.
-- A service keeps no unit, purchase price, stock, or cabinet; the Worker
-- normalises those fields to their empty value when it stores one, because
-- SQLite cannot drop the NOT NULL constraints from the existing columns
-- without rebuilding the table.
ALTER TABLE items ADD COLUMN type TEXT NOT NULL DEFAULT 'barang' CHECK (type IN ('barang', 'jasa'));

CREATE INDEX IF NOT EXISTS idx_items_type ON items (type);
