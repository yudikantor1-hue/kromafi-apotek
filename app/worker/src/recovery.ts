// One-time recovery codes: password recovery without any email service.
//
// A staff member receives the codes once (printed or written down). Only a
// salted SHA-256 hash is stored. Codes are 12 Crockford-base32 characters
// (about 60 bits of entropy), so a plain hash cannot be brute-forced even if
// the database leaks; a slow KDF would only make generation of eight codes
// take seconds without adding real protection at this entropy.
//
// Every failed attempt reuses the login_attempts lockout, so recovery cannot be
// used to spray guesses against an account.

import type { SessionStaff } from './auth';
import { clearFailedAttempts, recordFailedAttempt } from './auth';
import type { D1Database } from './env';
import { apiError, json, nowIso, readJson } from './http';
import { hashPassword } from './password';
import { can } from './permissions';
import { isValidUsername, normalizeUsername } from './username';

const CODE_COUNT = 8;
const CODE_LENGTH = 12;
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let raw = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    raw += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

async function hashCode(code: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${normalizeCode(code)}`),
  );
  return toHex(new Uint8Array(digest));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

interface StaffLookupRow {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
}

interface CodeRow {
  id: string;
  code_hash: string;
  code_salt: string;
}

async function writeAudit(
  db: D1Database,
  staffId: string,
  actorId: string,
  action: string,
  after: Record<string, unknown>,
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO audit_events
         (id, entity, entity_id, action, outcome, staff_id, device_id, operation_id,
          device_time, server_time, base_version, resulting_version, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      'staff',
      staffId,
      action,
      'applied',
      actorId,
      'server',
      crypto.randomUUID(),
      now,
      now,
      JSON.stringify(after),
    )
    .run();
}

export async function handleRecoveryGenerate(
  _request: Request,
  db: D1Database,
  actor: SessionStaff,
  targetId: string,
): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const row = await db
    .prepare('SELECT id, name, username, role, status FROM staff WHERE id = ?')
    .bind(targetId)
    .first<StaffLookupRow>();
  if (!row) return apiError(404, 'not_found');

  const codes = Array.from({ length: CODE_COUNT }, generateCode);
  const prepared: Array<{ id: string; hash: string; salt: string }> = [];
  for (const code of codes) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    prepared.push({ id: crypto.randomUUID(), hash: await hashCode(code, salt), salt });
  }

  const now = nowIso();
  // Reissuing invalidates any code that was never used.
  await db.prepare('DELETE FROM recovery_codes WHERE staff_id = ?').bind(row.id).run();
  for (const entry of prepared) {
    await db
      .prepare(
        'INSERT INTO recovery_codes (id, staff_id, code_hash, code_salt, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      )
      .bind(entry.id, row.id, entry.hash, entry.salt, now)
      .run();
  }

  await writeAudit(db, row.id, actor.id, 'staff.recovery_codes', { count: codes.length });

  return json({ codes, staff: { id: row.id, username: row.username } });
}

export async function handleRecoveryReset(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request);
  if (!body) return apiError(400, 'invalid_body');

  const username = normalizeUsername(body.username);
  const code = typeof body.code === 'string' ? body.code : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!isValidUsername(username)) return apiError(400, 'invalid_username');
  if (normalizeCode(code).length !== CODE_LENGTH) return apiError(400, 'invalid_code');
  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return apiError(400, 'invalid_password');
  }

  const attempts = await db
    .prepare('SELECT locked_until FROM login_attempts WHERE username = ?')
    .bind(username)
    .first<{ locked_until: string | null }>();
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > Date.now()) {
    const retryAfterSeconds = Math.ceil((Date.parse(attempts.locked_until) - Date.now()) / 1000);
    return json({ error: 'too_many_attempts', retryAfterSeconds }, 429);
  }

  const staff = await db
    .prepare('SELECT id, status FROM staff WHERE username = ?')
    .bind(username)
    .first<{ id: string; status: string }>();

  // Unknown username and wrong code answer identically, so this route cannot be
  // used to discover which accounts exist.
  if (!staff) {
    await recordFailedAttempt(db, username);
    return apiError(401, 'invalid_recovery_code');
  }

  if (staff.status !== 'Aktif') {
    await recordFailedAttempt(db, username);
    return apiError(403, 'account_inactive');
  }

  const { results } = await db
    .prepare('SELECT id, code_hash, code_salt FROM recovery_codes WHERE staff_id = ? AND used_at IS NULL')
    .bind(staff.id)
    .all<CodeRow>();

  const submitted = normalizeCode(code);
  let matched: CodeRow | null = null;
  for (const candidate of results ?? []) {
    const hash = await hashCode(submitted, candidate.code_salt);
    if (safeEqual(hash, candidate.code_hash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    await recordFailedAttempt(db, username);
    return apiError(401, 'invalid_recovery_code');
  }

  const now = nowIso();
  const credential = await hashPassword(newPassword);

  await db
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?')
    .bind(now, matched.id)
    .run();
  await db
    .prepare(
      'UPDATE staff SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?',
    )
    .bind(credential.hash, credential.salt, credential.iterations, now, staff.id)
    .run();
  await db.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(staff.id).run();
  await clearFailedAttempts(db, username);
  await writeAudit(db, staff.id, staff.id, 'staff.recovery_used', { codeId: matched.id });

  return json({ ok: true });
}
