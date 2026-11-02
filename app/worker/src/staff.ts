import type { SessionStaff } from './auth';
import type { D1Database } from './env';
import { apiError, json, nowIso, readJson } from './http';
import { hashPassword } from './password';
import { can } from './permissions';
import { issuePin } from './pin';
import { isValidUsername, normalizeUsername } from './username';

const ROLES = ['admin', 'staf'] as const;
const STATUSES = ['Aktif', 'Tidak aktif'] as const;
const MIN_PASSWORD_LENGTH = 8;

export interface StaffRow {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffWire {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toWire(row: StaffRow): StaffWire {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    status: row.status,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface StaffInput {
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
}

type Parsed = { ok: true; value: StaffInput } | { ok: false; error: string };

function parseInput(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false, error: 'validation' };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return { ok: false, error: 'validation' };

  const username = normalizeUsername(body.username);
  if (!isValidUsername(username)) return { ok: false, error: 'validation' };

  const role = ROLES.includes(body.role as 'admin' | 'staf') ? (body.role as 'admin' | 'staf') : null;
  if (!role) return { ok: false, error: 'validation' };

  const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
    ? (body.status as string)
    : 'Aktif';

  return { ok: true, value: { name, username, role, status } };
}

async function recordStaffAudit(
  db: D1Database,
  actor: SessionStaff,
  action: string,
  targetId: string,
  before: StaffWire | null,
  after: StaffWire | null,
  note = '',
): Promise<void> {
  const serverTime = nowIso();
  await db
    .prepare(
      `INSERT INTO audit_events
         (id, entity, entity_id, action, outcome, staff_id, device_id, operation_id, device_time,
          server_time, base_version, resulting_version, before_json, after_json, note)
       VALUES (?, 'staff', ?, ?, 'applied', ?, 'server', ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      targetId,
      action,
      actor.id,
      crypto.randomUUID(),
      serverTime,
      serverTime,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      note,
    )
    .run();
}

async function findStaff(db: D1Database, id: string): Promise<StaffRow | null> {
  return db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first<StaffRow>();
}

async function activeAdminCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM staff WHERE role = 'admin' AND status = 'Aktif'")
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function handleStaffList(_request: Request, db: D1Database, actor: SessionStaff): Promise<Response> {
  if (!can(actor, 'staff:read')) return apiError(403, 'forbidden');
  const { results } = await db
    .prepare('SELECT * FROM staff ORDER BY name COLLATE NOCASE ASC')
    .all<StaffRow>();
  return json({ staff: results.map(toWire), serverTime: nowIso() });
}

/**
 * Account creation no longer takes a password (10.2.9, 10.2.10). The account
 * starts with an unguessable credential nobody knows, and the admin hands over
 * a temporary PIN that the new staff member exchanges for their own password.
 */
export async function handleStaffCreate(request: Request, db: D1Database, actor: SessionStaff): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const parsed = parseInput(await readJson(request));
  if (!parsed.ok) return apiError(400, parsed.error);
  const input = parsed.value;

  const existing = await db
    .prepare('SELECT id FROM staff WHERE username = ?')
    .bind(input.username)
    .first<{ id: string }>();
  if (existing) return apiError(409, 'username_taken');

  // A random credential nobody holds: no password can match it, so the account
  // is reachable only through the PIN until its owner sets a password.
  const credential = await hashPassword(`${crypto.randomUUID()}:${crypto.randomUUID()}`);
  const now = nowIso();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO staff
           (id, name, username, role, status, password_hash, password_salt, password_iterations,
            deactivated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.name,
        input.username,
        input.role,
        input.status,
        credential.hash,
        credential.salt,
        credential.iterations,
        input.status === 'Aktif' ? null : now,
        now,
        now,
      )
      .run();
  } catch {
    return apiError(409, 'username_taken');
  }

  const issued = await issuePin(db, id);
  const created = await findStaff(db, id);
  const wire = created ? toWire(created) : null;
  await recordStaffAudit(db, actor, 'create', id, null, wire, 'pin_issued');

  return json({ staff: wire, pin: issued.pin, pinExpiresAt: issued.expiresAt }, 201);
}

/** Issues a fresh PIN, replacing any PIN that was never used. */
export async function handleStaffPin(
  _request: Request,
  db: D1Database,
  actor: SessionStaff,
  id: string,
): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const target = await findStaff(db, id);
  if (!target) return apiError(404, 'not_found');
  if (target.status !== 'Aktif') return apiError(400, 'account_inactive');

  const issued = await issuePin(db, id);
  await recordStaffAudit(db, actor, 'pin_issued', id, toWire(target), toWire(target), 'pin_issued');
  return json({ pin: issued.pin, expiresAt: issued.expiresAt, staff: toWire(target) });
}

export async function handleStaffUpdate(
  request: Request,
  db: D1Database,
  actor: SessionStaff,
  id: string,
): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const parsed = parseInput(await readJson(request));
  if (!parsed.ok) return apiError(400, parsed.error);
  const input = parsed.value;

  const target = await findStaff(db, id);
  if (!target) return apiError(404, 'not_found');

  const before = toWire(target);
  const changesRole = input.role !== target.role;
  const changesStatus = input.status !== target.status;

  if (target.id === actor.id && (changesRole || changesStatus)) {
    return apiError(400, 'cannot_change_self');
  }

  const removesAdmin =
    target.role === 'admin' &&
    target.status === 'Aktif' &&
    (input.role !== 'admin' || input.status !== 'Aktif');
  if (removesAdmin && (await activeAdminCount(db)) <= 1) {
    return apiError(400, 'last_admin');
  }

  const sameUsername = await db
    .prepare('SELECT id FROM staff WHERE username = ? AND id <> ?')
    .bind(input.username, id)
    .first<{ id: string }>();
  if (sameUsername) return apiError(409, 'username_taken');

  const now = nowIso();
  const deactivatedAt = input.status === 'Aktif' ? null : (target.deactivated_at ?? now);

  try {
    await db
      .prepare('UPDATE staff SET name = ?, username = ?, role = ?, status = ?, deactivated_at = ?, updated_at = ? WHERE id = ?')
      .bind(input.name, input.username, input.role, input.status, deactivatedAt, now, id)
      .run();
  } catch {
    return apiError(409, 'username_taken');
  }

  if (input.status !== 'Aktif') {
    await db.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(id).run();
  }

  const updated = await findStaff(db, id);
  const after = updated ? toWire(updated) : null;
  await recordStaffAudit(db, actor, 'update', id, before, after);
  return json({ staff: after });
}

/**
 * Admin-set password stays as the fallback recovery path (P5): a staff member
 * who no longer has a PIN or recovery code can be given a password directly.
 */
export async function handleStaffPassword(
  request: Request,
  db: D1Database,
  actor: SessionStaff,
  id: string,
): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const body = await readJson(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) return apiError(400, 'validation');

  const target = await findStaff(db, id);
  if (!target) return apiError(404, 'not_found');

  const credential = await hashPassword(password);
  await db
    .prepare(
      'UPDATE staff SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?',
    )
    .bind(credential.hash, credential.salt, credential.iterations, nowIso(), id)
    .run();

  // A password reset ends every existing session for that account.
  await db.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(id).run();

  await recordStaffAudit(db, actor, 'password_reset', id, toWire(target), toWire(target), 'password_reset');
  return json({ ok: true });
}
