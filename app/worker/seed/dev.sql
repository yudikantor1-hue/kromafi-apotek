-- Local development seed only. Never run this against a production database.
-- Accounts mirror the approved prototype, now identified by username:
--   admin / admin  (admin)
--   user  / user   (staf)
-- Passwords are stored as PBKDF2-SHA-256 hashes, exactly like real accounts.
-- Iterations are 100,000 because workerd rejects anything above that.
--
-- Apply with: npm run db:seed:local

INSERT OR REPLACE INTO staff
  (id, name, username, role, status, password_hash, password_salt, password_iterations, deactivated_at, created_at, updated_at)
VALUES
  ('staff-admin', 'Admin', 'admin', 'admin', 'Aktif', 'df8d1384653c26a80686e82c21eead6c2347cc256282bc725abac9fde070325f', '617a11b91aae3aec86f55ae6faccd67b', 100000, NULL, '2026-10-30T12:01:50.857Z', '2026-10-30T12:01:50.857Z'),
  ('staff-budi', 'Staf', 'user', 'staf', 'Aktif', '6bd4f968792cc759d10fe018da4c4e7c275ff66d5494d50a9bfd32dbdb5fefd6', 'b02c472fefa8ea0a58e24dee88188f28', 100000, NULL, '2026-10-30T12:01:50.857Z', '2026-10-30T12:01:50.857Z');
