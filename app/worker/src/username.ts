// Login identity is a username: this application never sends email, so an email
// address would only add validation rules and typing mistakes.
//
// Rules: 3-32 characters, lowercase, starting with a letter or digit, then
// letters, digits, dot, underscore, or dash. Uniqueness is enforced case
// insensitively by the database, and comparisons normalise first.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidUsername(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(value)
  );
}
