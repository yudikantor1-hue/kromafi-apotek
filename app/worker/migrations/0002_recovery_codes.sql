-- One-time recovery codes: the offline-friendly alternative to email-based
-- password recovery. A code is handed to the staff member once, stored only as
-- a salted SHA-256 hash, and can be used exactly once.

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_staff ON recovery_codes(staff_id);
