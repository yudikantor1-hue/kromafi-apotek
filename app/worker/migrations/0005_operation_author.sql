-- Offline work belongs to the account that recorded it, not to whoever signs in
-- and pushes it later (decision 10.2.12 in PLAN.md). Rows written before this
-- migration carry no author and fall back to the pushing session.

ALTER TABLE sync_operations ADD COLUMN author_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sync_operations_author ON sync_operations (author_id, status);
