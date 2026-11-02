import type { D1Database } from './env';
import {
  apiError,
  clearSessionCookie,
  isSecureRequest,
  json,
  nowIso,
  readCookie,
  readJson,
  SESSION_COOKIE,
  sessionCookie,
} from './http';
import { clearPin, verifyPin } from './pin';
import { hashPassword, verifyPassword } from './password';
import { normalizeUsername } from './username';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// A PIN session exists only to let its owner choose a password; it is short and
// every other route is closed while it lasts.
const PIN_SESSION_TTL_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

export interface SessionStaff {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  deactivatedAt: string | null;
  mustChangePassword: boolean;
}

interface StaffRow {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  deactivated_at: string | null;
  pin_hash?: string | null;
  pin_salt?: string | null;
  pin_iterations?: number | null;
  pin_expires_at?: string | null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function toSessionStaff(row: StaffRow, mustChangePassword = false): SessionStaff {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    status: row.status,
    deactivatedAt: row.deactivated_at,
    mustChangePassword,
  };
}

export async function recordFailedAttempt(db: D1Database, username: string): Promise<void> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT attempt_count, first_attempt_at FROM login_attempts WHERE username = ?')
    .bind(username)
    .first<{ attempt_count: number; first_attempt_at: string }>();

  const withinWindow = row && now - Date.parse(row.first_attempt_at) < ATTEMPT_WINDOW_MS;
  const count = withinWindow ? row.attempt_count + 1 : 1;
  const firstAttemptAt = withinWindow ? row.first_attempt_at : new Date(now).toISOString();
  const lockedUntil = count >= ATTEMPT_LIMIT ? new Date(now + ATTEMPT_WINDOW_MS).toISOString() : null;

  await db
    .prepare(
      `INSERT INTO login_attempts (username, attempt_count, first_attempt_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         first_attempt_at = excluded.first_attempt_at,
         locked_until = excluded.locked_until`,
    )
    .bind(username, count, firstAttemptAt, lockedUntil)
    .run();
}

export async function clearFailedAttempts(db: D1Database, username: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE username = ?').bind(username).run();
}

export async function createSession(
  db: D1Database,
  staffId: string,
  options: { mustChangePassword?: boolean; ttlMs?: number } = {},
): Promise<{ token: string; expiresAt: string }> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const expiresAt = new Date(now + ttlMs).toISOString();
  await db
    .prepare(
      'INSERT INTO sessions (token_hash, staff_id, created_at, expires_at, must_change_password) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(tokenHash, staffId, new Date(now).toISOString(), expiresAt, options.mustChangePassword ? 1 : 0)
    .run();
  return { token, expiresAt };
}

export async function getSessionStaff(request: Request, db: D1Database): Promise<SessionStaff | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.id, s.name, s.username, s.role, s.status, s.password_hash, s.password_salt,
              s.password_iterations, s.deactivated_at, sessions.expires_at,
              sessions.must_change_password
         FROM sessions JOIN staff s ON s.id = sessions.staff_id
        WHERE sessions.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<StaffRow & { expires_at: string; must_change_password: number | null }>();

  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return toSessionStaff(row, Boolean(row.must_change_password));
}

async function lockoutResponse(db: D1Database, username: string): Promise<Response | null> {
  const attempts = await db
    .prepare('SELECT locked_until FROM login_attempts WHERE username = ?')
    .bind(username)
    .first<{ locked_until: string | null }>();
  if (!attempts?.locked_until) return null;
  const lockedUntil = Date.parse(attempts.locked_until);
  if (lockedUntil <= Date.now()) return null;
  return json({ error: 'too_many_attempts', retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) }, 429);
}

/**
 * Sign-in with the temporary PIN of a newly created account. A successful PIN
 * opens a short session that may only set a password (10.2.10).
 */
async function handlePinLogin(
  request: Request,
  db: D1Database,
  username: string,
  pin: string,
): Promise<Response> {
  const locked = await lockoutResponse(db, username);
  if (locked) return locked;

  const staff = await db
    .prepare(
      `SELECT id, name, username, role, status, password_hash, password_salt, password_iterations,
              deactivated_at, pin_hash, pin_salt, pin_iterations, pin_expires_at
         FROM staff WHERE username = ?`,
    )
    .bind(username)
    .first<StaffRow>();

  // An unknown username answers exactly like a wrong PIN, so the screen cannot
  // be used to discover which accounts exist.
  if (!staff) {
    await recordFailedAttempt(db, username);
    return apiError(401, 'invalid_pin');
  }

  const check = await verifyPin(pin, staff);
  if (check !== 'ok') {
    await recordFailedAttempt(db, username);
    return apiError(401, check === 'expired' ? 'pin_expired' : 'invalid_pin');
  }

  if (staff.status !== 'Aktif') {
    await recordFailedAttempt(db, username);
    return apiError(403, 'account_inactive');
  }

  await clearFailedAttempts(db, username);
  await clearPin(db, staff.id);
  const session = await createSession(db, staff.id, {
    mustChangePassword: true,
    ttlMs: PIN_SESSION_TTL_MS,
  });

  return json(
    { staff: toSessionStaff(staff, true), requiresPasswordChange: true, expiresAt: session.expiresAt },
    200,
    {
      'set-cookie': sessionCookie(
        session.token,
        isSecureRequest(request),
        Math.floor(PIN_SESSION_TTL_MS / 1000),
      ),
    },
  );
}

export async function handleLogin(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request);
  const username = normalizeUsername(body?.username);
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username) return apiError(400, 'missing_credentials');
  if (pin) return handlePinLogin(request, db, username, pin);
  if (!password) return apiError(400, 'missing_credentials');

  const locked = await lockoutResponse(db, username);
  if (locked) return locked;

  const staff = await db
    .prepare(
      `SELECT id, name, username, role, status, password_hash, password_salt, password_iterations, deactivated_at
         FROM staff WHERE username = ?`,
    )
    .bind(username)
    .first<StaffRow>();

  if (!staff) {
    await recordFailedAttempt(db, username);
    return apiError(401, 'invalid_credentials');
  }

  const valid = await verifyPassword(
    { hash: staff.password_hash, salt: staff.password_salt, iterations: staff.password_iterations },
    password,
  );
  if (!valid) {
    await recordFailedAttempt(db, username);
    return apiError(401, 'invalid_credentials');
  }

  if (staff.status !== 'Aktif') return apiError(403, 'account_inactive');

  await clearFailedAttempts(db, username);
  const session = await createSession(db, staff.id);
  return json(
    { staff: toSessionStaff(staff), expiresAt: session.expiresAt },
    200,
    {
      'set-cookie': sessionCookie(
        session.token,
        isSecureRequest(request),
        Math.floor(SESSION_TTL_MS / 1000),
      ),
    },
  );
}

/**
 * The first sign-in with a PIN must end here: the staff member chooses their own
 * password, which promotes the short PIN session to a normal one.
 */
export async function handleSetOwnPassword(request: Request, db: D1Database): Promise<Response> {
  const staff = await getSessionStaff(request, db);
  if (!staff) return apiError(401, 'unauthenticated');
  if (!staff.mustChangePassword) return apiError(400, 'password_change_not_required');

  const body = await readJson(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return apiError(400, 'invalid_password');
  }

  const credential = await hashPassword(password);
  const now = nowIso();
  await db
    .prepare(
      'UPDATE staff SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?',
    )
    .bind(credential.hash, credential.salt, credential.iterations, now, staff.id)
    .run();

  const token = readCookie(request, SESSION_COOKIE);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db
    .prepare('UPDATE sessions SET must_change_password = 0, expires_at = ? WHERE token_hash = ?')
    .bind(expiresAt, tokenHash)
    .run();

  await db
    .prepare(
      `INSERT INTO audit_events
         (id, entity, entity_id, action, outcome, staff_id, device_id, operation_id,
          device_time, server_time, base_version, resulting_version, before_json, after_json, note)
       VALUES (?, 'staff', ?, 'password_set', 'applied', ?, 'server', ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
    )
    .bind(crypto.randomUUID(), staff.id, staff.id, crypto.randomUUID(), now, now, 'first_pin_sign_in')
    .run();

  return json(
    { ok: true, staff: { ...staff, mustChangePassword: false }, expiresAt },
    200,
    {
      'set-cookie': sessionCookie(token, isSecureRequest(request), Math.floor(SESSION_TTL_MS / 1000)),
    },
  );
}

export async function handleLogout(request: Request, db: D1Database): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSessionCookie(isSecureRequest(request)) },
  });
}

export async function handleMe(request: Request, db: D1Database): Promise<Response> {
  const staff = await getSessionStaff(request, db);
  if (!staff) return apiError(401, 'unauthenticated');
  return json({ staff, serverTime: nowIso() });
}
