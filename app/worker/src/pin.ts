// Temporary sign-in PIN for a newly created account.
//
// A 6-digit PIN has only a million possible values, so it is stored with the
// same PBKDF2-SHA-256 settings as a password instead of a fast hash like the
// recovery codes. It lives on the staff row, so issuing a new PIN replaces the
// previous one, and it is cleared as soon as it is used.

import type { D1Database } from './env';
import { nowIso } from './http';
import { hashPassword, verifyPassword } from './password';

export const PIN_LENGTH = 6;
export const PIN_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssuedPin {
  pin: string;
  expiresAt: string;
}

export interface StoredPinRow {
  pin_hash?: string | null;
  pin_salt?: string | null;
  pin_iterations?: number | null;
  pin_expires_at?: string | null;
}

export type PinCheck = 'ok' | 'missing' | 'expired' | 'mismatch';

export function generatePin(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PIN_LENGTH));
  let pin = '';
  for (let index = 0; index < PIN_LENGTH; index += 1) pin += String(bytes[index] % 10);
  return pin;
}

export async function issuePin(db: D1Database, staffId: string): Promise<IssuedPin> {
  const pin = generatePin();
  const credential = await hashPassword(pin);
  const expiresAt = new Date(Date.now() + PIN_TTL_MS).toISOString();
  await db
    .prepare(
      `UPDATE staff
          SET pin_hash = ?, pin_salt = ?, pin_iterations = ?, pin_expires_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(credential.hash, credential.salt, credential.iterations, expiresAt, nowIso(), staffId)
    .run();
  return { pin, expiresAt };
}

export async function clearPin(db: D1Database, staffId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE staff
          SET pin_hash = NULL, pin_salt = NULL, pin_iterations = NULL, pin_expires_at = NULL
        WHERE id = ?`,
    )
    .bind(staffId)
    .run();
}

export async function verifyPin(pin: string, row: StoredPinRow): Promise<PinCheck> {
  if (!row.pin_hash || !row.pin_salt || !row.pin_iterations || !row.pin_expires_at) return 'missing';
  if (Date.parse(row.pin_expires_at) <= Date.now()) return 'expired';
  if (!/^\d{6}$/.test(pin)) return 'mismatch';
  const valid = await verifyPassword(
    { hash: row.pin_hash, salt: row.pin_salt, iterations: row.pin_iterations },
    pin,
  );
  return valid ? 'ok' : 'mismatch';
}
