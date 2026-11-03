-- Cash is the one payment method every sale can fall back to, so the row is
-- created with the schema and locked on the server (10.2.19). The fixed id lets
-- the sync engine recognise it; `OR IGNORE` covers an installation that already
-- created a payment method named Tunai by hand.
INSERT OR IGNORE INTO payment_methods
  (id, nama, status, version, device_updated_at, server_updated_at, created_at, updated_by)
VALUES
  ('payment_method_tunai', 'Tunai', 'Aktif', 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'server');
