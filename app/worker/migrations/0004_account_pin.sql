-- Temporary sign-in PIN for a newly created account (decided in PLAN.md 10.2.10).
--
-- A 6-digit PIN has only a million possible values, so it is hashed with the
-- same PBKDF2 settings as a password rather than a fast hash. The PIN is single
-- use, valid for 24 hours, and replaced whenever a new one is issued.

ALTER TABLE staff ADD COLUMN pin_hash TEXT;
ALTER TABLE staff ADD COLUMN pin_salt TEXT;
ALTER TABLE staff ADD COLUMN pin_iterations INTEGER;
ALTER TABLE staff ADD COLUMN pin_expires_at TEXT;

-- A session opened with a PIN cannot use the app until its owner sets a
-- password. The Worker enforces this on every protected route.
ALTER TABLE sessions ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
