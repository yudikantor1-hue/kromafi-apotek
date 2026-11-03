import type { SessionStaff } from './auth';
import type { D1Database } from './env';
import { apiError, json, nowIso, readJson } from './http';
import { hashPassword } from './password';
import { can } from './permissions';
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
  password: string;
}

type Parsed = { ok: true; value: StaffInput } | { ok: false; error: string };

function parseInput(body: Record<string, unknown> | null, requirePassword = true): Parsed {
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

  // A new account starts with a password the admin types and hands over; an
  // update leaves the stored credential alone.
  const password = typeof body.password === 'string' ? body.password : '';
  if (requirePassword && (password.length < MIN_PASSWORD_LENGTH || password.length > 200)) {
    return { ok: false, error: 'invalid_password' };
  }

  return { ok: true, value: { name, username, role, status, password } };
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

  // A staff member only ever sees their own account; admins manage the station.
  if (actor.role !== 'admin') {
    const self = await findStaff(db, actor.id);
    return json({ staff: self ? [toWire(self)] : [], serverTime: nowIso() });
  }

  const { results } = await db
    .prepare('SELECT * FROM staff ORDER BY name COLLATE NOCASE ASC')
    .all<StaffRow>();
  return json({ staff: results.map(toWire), serverTime: nowIso() });
}

/** An admin creates an account with the initial password its owner will use (10.2.20). */
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

  const credential = await hashPassword(input.password);
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

  const created = await findStaff(db, id);
  const wire = created ? toWire(created) : null;
  await recordStaffAudit(db, actor, 'create', id, null, wire);

  return json({ staff: wire }, 201);
}

/**
 * Closes ledger rows a deactivated account left in flight. Device queues are
 * cancelled when they reach the server; these are the rows the server had
 * already claimed, so they are marked here instead of waiting forever.
 */
async function cancelPendingOperations(db: D1Database, staffId: string): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE sync_operations
          SET status = 'cancelled', message = 'account_deactivated'
        WHERE status = 'processing' AND (author_id = ? OR (author_id IS NULL AND staff_id = ?))`,
    )
    .bind(staffId, staffId)
    .run();
  return result.meta.changes;
}

export async function handleStaffUpdate(
  request: Request,
  db: D1Database,
  actor: SessionStaff,
  id: string,
): Promise<Response> {
  if (!can(actor, 'staff:write')) return apiError(403, 'forbidden');

  const parsed = parseInput(await readJson(request), false);
  if (!parsed.ok) return apiError(400, parsed.error);
  const input = parsed.value;

  const target = await findStaff(db, id);
  if (!target) return apiError(404, 'not_found');

  // A name and username are fixed once the account exists (Petugas detail rule).
  if (input.name !== target.name || input.username !== target.username) {
    return apiError(400, 'identity_locked');
  }

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
  // Reactivating clears the mark, so a later deactivation records a fresh time
  // (10.2.12). Keeping the old value would judge new work against a stale date.
  const deactivatedAt =
    input.status === 'Aktif' ? null : changesStatus ? now : (target.deactivated_at ?? now);

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

  // Work queued on a device is judged per operation when it arrives (10.2.12);
  // this closes whatever the server had already claimed for the account.
  const cancelled = input.status === 'Aktif' ? 0 : await cancelPendingOperations(db, id);

  const updated = await findStaff(db, id);
  const after = updated ? toWire(updated) : null;
  await recordStaffAudit(
    db,
    actor,
    'update',
    id,
    before,
    after,
    cancelled > 0 ? `cancelled_pending_operations:${cancelled}` : '',
  );
  return json({ staff: after });
}

/**
 * Admin-set password stays as the fallback recovery path (P5): a staff member
 * who no longer has a recovery code can be given a password directly.
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
  // A reset serves an account in use (10.2.14). An inactive account is
  // reactivated first, so a dormant credential is never changed blind.
  if (target.status !== 'Aktif') return apiError(400, 'account_inactive');

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
