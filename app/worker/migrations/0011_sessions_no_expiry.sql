-- Sessions no longer expire by time (10.2.32): a person stays signed in until
-- they log out, their account is deactivated, or an admin resets the password.
ALTER TABLE sessions DROP COLUMN expires_at;
