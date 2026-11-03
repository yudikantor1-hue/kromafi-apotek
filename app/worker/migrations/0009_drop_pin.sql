-- PIN sign-in and its forced password screen were removed from the product
-- (10.2.20), so these columns are no longer read or written.
ALTER TABLE staff DROP COLUMN pin_hash;
ALTER TABLE staff DROP COLUMN pin_salt;
ALTER TABLE staff DROP COLUMN pin_iterations;
ALTER TABLE staff DROP COLUMN pin_expires_at;
ALTER TABLE sessions DROP COLUMN must_change_password;
