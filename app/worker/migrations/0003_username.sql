-- Login identity is a username. This application never sends email, so an
-- email address would only add validation rules and typing mistakes.
--
-- The rename keeps the existing values, uniqueness, and case-insensitive
-- collation. Accounts created before this migration keep working: their old
-- email text becomes their username.

ALTER TABLE staff RENAME COLUMN email TO username;
ALTER TABLE login_attempts RENAME COLUMN email TO username;
