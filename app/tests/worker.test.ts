import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../worker/src/index';
import { hashPassword } from '../worker/src/password';
import { createTestDatabase, type TestDatabase } from './helpers/testDatabase';

const ORIGIN = 'https://apotek.test';

type Env = { DB: TestDatabase };

let db: TestDatabase;
let env: Env;

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function insertStaff(
  database: TestDatabase,
  staff: { id: string; name: string; username: string; role: 'admin' | 'staf'; status?: string },
  password = 'rahasia123',
) {
  const credential = await hashPassword(password);
  const now = iso();
  database.rawRun(
    `INSERT INTO staff
       (id, name, username, role, status, password_hash, password_salt, password_iterations, deactivated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    staff.id,
    staff.name,
    staff.username,
    staff.role,
    staff.status ?? 'Aktif',
    credential.hash,
    credential.salt,
    credential.iterations,
    staff.status === 'Tidak aktif' ? now : null,
    now,
    now,
  );
}

async function call(path: string, init: RequestInit = {}) {
  const request = new Request(`${ORIGIN}${path}`, init);
  return worker.fetch(request, env as never);
}

async function login(username: string, password = 'rahasia123') {
  const response = await call('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { response, cookie };
}

function jsonRequest(path: string, cookie: string, body: unknown) {
  return call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function send(method: string, path: string, cookie: string, body: unknown) {
  return call(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    nama: 'Paracetamol 500mg',
    satuan: 'Tablet',
    hargaModal: 300,
    hargaJual: 500,
    stok: 0,
    lemari: 'Lemari depan',
    status: 'Aktif',
    ...overrides,
  };
}

function createOp(overrides: Record<string, unknown> = {}) {
  return {
    operationId: crypto.randomUUID(),
    entity: 'item',
    action: 'create',
    itemId: crypto.randomUUID(),
    authorId: 'staff-admin',
    baseVersion: 0,
    deviceTime: iso(),
    payload: basePayload(),
    ...overrides,
  };
}

function updateOp(itemId: string, baseVersion: number, overrides: Record<string, unknown> = {}) {
  return {
    operationId: crypto.randomUUID(),
    entity: 'item',
    action: 'update',
    itemId,
    authorId: 'staff-admin',
    baseVersion,
    deviceTime: iso(),
    payload: basePayload({ nama: 'Paracetamol 500mg', stok: 10 }),
    ...overrides,
  };
}

async function push(cookie: string, deviceId: string, operations: unknown[]) {
  const response = await jsonRequest('/api/sync/push', cookie, { deviceId, operations });
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  db = createTestDatabase();
  env = { DB: db };
  await insertStaff(db, { id: 'staff-admin', name: 'Admin', username: 'admin', role: 'admin' });
  await insertStaff(db, { id: 'staff-budi', name: 'Budi', username: 'user', role: 'staf' });
});

describe('authentication', () => {
  it('signs in an active staff account and returns the session profile', async () => {
    const { response, cookie } = await login('admin');

    expect(response.status).toBe(200);
    expect(cookie).toMatch(/^kromafi_session=/);
    expect(await response.json()).toMatchObject({ staff: { id: 'staff-admin', role: 'admin' } });

    const me = await call('/api/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ staff: { name: 'Admin', username: 'admin' } });
  });

  it('rejects a wrong password without creating a session', async () => {
    const { response, cookie } = await login('admin', 'salah-sekali');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'invalid_credentials' });
    expect(cookie).toBe('');
  });

  it('locks the account after five failed attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login('admin', 'salah');
    }

    const blocked = await login('admin');
    expect(blocked.response.status).toBe(429);
    expect(await blocked.response.json()).toMatchObject({ error: 'too_many_attempts' });
  });

  it('rejects requests with no session', async () => {
    const response = await call('/api/sync/snapshot');
    expect(response.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const { cookie } = await login('user');
    db.rawRun('UPDATE sessions SET expires_at = ?', '2020-01-01T00:00:00.000Z');

    const me = await call('/api/me', { headers: { cookie } });
    expect(me.status).toBe(401);
    expect(db.raw('SELECT token_hash FROM sessions')).toHaveLength(0);
  });

  it('invalidates the session on logout', async () => {
    const { cookie } = await login('user');

    const logout = await jsonRequest('/api/logout', cookie, {});
    expect(logout.status).toBe(204);

    const me = await call('/api/me', { headers: { cookie } });
    expect(me.status).toBe(401);
  });
});

describe('permissions', () => {
  it('allows staff to edit items and reserves audit history for admins', async () => {
    const staff = await login('user');
    const applied = await push(staff.cookie, 'device-budi', [createOp()]);
    expect(applied.body.results[0].status).toBe('applied');

    const forbidden = await call('/api/audit', { headers: { cookie: staff.cookie } });
    expect(forbidden.status).toBe(403);

    const admin = await login('admin');
    const allowed = await call('/api/audit', { headers: { cookie: admin.cookie } });
    expect(allowed.status).toBe(200);
  });
});

describe('cross-origin protection', () => {
  it('rejects a mutation from a foreign origin', async () => {
    const admin = await login('admin');
    const response = await call('/api/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie, origin: 'https://evil.example' },
      body: JSON.stringify({ deviceId: 'device-1', operations: [createOp()] }),
    });

    expect(response.status).toBe(403);
    expect(db.raw('SELECT id FROM items')).toHaveLength(0);
  });

  it('accepts the loopback development origin used by the Vite proxy', async () => {
    const request = new Request('http://127.0.0.1:8787/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ username: 'admin', password: 'rahasia123' }),
    });

    const response = await worker.fetch(request, env as never);
    expect(response.status).toBe(200);
  });
});

describe('staff administration', () => {
  it('shows an admin every account but a staff member only their own', async () => {
    const staff = await login('user');
    const own = await call('/api/staff', { headers: { cookie: staff.cookie } });
    expect(own.status).toBe(200);
    const ownBody = await own.json();
    expect(ownBody.staff.map((row: { username: string }) => row.username)).toEqual(['user']);

    const admin = await login('admin');
    const all = await call('/api/staff', { headers: { cookie: admin.cookie } });
    expect(all.status).toBe(200);
    const allBody = await all.json();
    expect(allBody.staff.map((row: { username: string }) => row.username)).toEqual(
      expect.arrayContaining(['admin', 'user']),
    );
    expect(JSON.stringify(allBody)).not.toMatch(/password_(hash|salt)/);
  });

  it('refuses to rename an account once it exists', async () => {
    const admin = await login('admin');
    const base = { name: 'Budi', username: 'user', role: 'staf', status: 'Aktif' };

    const newName = await send('PUT', '/api/staff/staff-budi', admin.cookie, { ...base, name: 'Budi Baru' });
    expect(newName.status).toBe(400);
    expect(await newName.json()).toMatchObject({ error: 'identity_locked' });

    const newUsername = await send('PUT', '/api/staff/staff-budi', admin.cookie, { ...base, username: 'budibaru' });
    expect(newUsername.status).toBe(400);
    expect(await newUsername.json()).toMatchObject({ error: 'identity_locked' });
  });

  it('lets a signed-in staff member change their own password', async () => {
    const staff = await login('user');
    const changed = await jsonRequest('/api/session/password', staff.cookie, { password: 'sandi-sendiri-1' });
    expect(changed.status).toBe(200);

    expect((await login('user', 'sandi-sendiri-1')).response.status).toBe(200);
    expect((await login('user', 'rahasia123')).response.status).toBe(401);
  });

  it('creates an account with a temporary PIN and rejects a duplicate username', async () => {
    const admin = await login('admin');
    const payload = { name: 'Sinta', username: 'sinta', role: 'staf', status: 'Aktif' };

    const created = await jsonRequest('/api/staff', admin.cookie, payload);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.pin).toMatch(/^\d{6}$/);
    expect(body.pinExpiresAt).toBeTruthy();

    const duplicate = await jsonRequest('/api/staff', admin.cookie, payload);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: 'username_taken' });
  });

  it('rejects invalid account data and non-admin mutations', async () => {
    const admin = await login('admin');
    const base = { name: 'Baru', username: 'baru', role: 'staf', status: 'Aktif' };

    expect((await jsonRequest('/api/staff', admin.cookie, { ...base, name: '' })).status).toBe(400);
    expect((await jsonRequest('/api/staff', admin.cookie, { ...base, username: 'bukan username' })).status).toBe(400);
    expect((await jsonRequest('/api/staff', admin.cookie, { ...base, role: 'owner' })).status).toBe(400);

    const staff = await login('user');
    expect((await jsonRequest('/api/staff', staff.cookie, base)).status).toBe(403);
    expect(
      (
        await send('PUT', '/api/staff/staff-budi', staff.cookie, {
          name: 'Budi',
          username: 'user',
          role: 'admin',
          status: 'Aktif',
        })
      ).status,
    ).toBe(403);
  });

  it('deactivating an account revokes its sessions and blocks sign-in', async () => {
    const admin = await login('admin');
    const budi = await login('user');

    const response = await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });
    expect(response.status).toBe(200);

    expect((await call('/api/me', { headers: { cookie: budi.cookie } })).status).toBe(401);
    expect((await login('user')).response.status).toBe(403);

    const row = db.raw<{ deactivated_at: string | null }>(
      'SELECT deactivated_at FROM staff WHERE id = ?',
      'staff-budi',
    )[0];
    expect(row.deactivated_at).toBeTruthy();
  });

  it('resets a password and revokes the target sessions', async () => {
    const admin = await login('admin');
    const budi = await login('user');

    const response = await jsonRequest('/api/staff/staff-budi/password', admin.cookie, { password: 'ganti-12345' });
    expect(response.status).toBe(200);

    expect((await call('/api/me', { headers: { cookie: budi.cookie } })).status).toBe(401);
    expect((await login('user', 'ganti-12345')).response.status).toBe(200);
    expect((await login('user', 'rahasia123')).response.status).toBe(401);
  });

  it('offers a reset only for an active account', async () => {
    const admin = await login('admin');
    const staff = await login('user');

    // Staff cannot use the admin reset route, not even against themselves.
    const asStaff = await jsonRequest('/api/staff/staff-admin/password', staff.cookie, {
      password: 'sandi-lain-123',
    });
    expect(asStaff.status).toBe(403);

    const deactivated = await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });
    expect(deactivated.status).toBe(200);

    const refused = await jsonRequest('/api/staff/staff-budi/password', admin.cookie, {
      password: 'sandi-baru-123',
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: 'account_inactive' });

    // The stored password was not touched: it still works once reactivated.
    await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Aktif',
    });
    expect((await login('user', 'rahasia123')).response.status).toBe(200);
  });

  it('refuses to let an admin lock themselves out', async () => {
    const admin = await login('admin');

    const deactivateSelf = await send('PUT', '/api/staff/staff-admin', admin.cookie, {
      name: 'Admin',
      username: 'admin',
      role: 'admin',
      status: 'Tidak aktif',
    });
    expect(deactivateSelf.status).toBe(400);
    expect(await deactivateSelf.json()).toMatchObject({ error: 'cannot_change_self' });

    const demoteSelf = await send('PUT', '/api/staff/staff-admin', admin.cookie, {
      name: 'Admin',
      username: 'admin',
      role: 'staf',
      status: 'Aktif',
    });
    expect(demoteSelf.status).toBe(400);
    expect(await demoteSelf.json()).toMatchObject({ error: 'cannot_change_self' });
  });
});

describe('temporary PIN accounts', () => {
  async function createAccount(adminCookie: string, username = 'sinta') {
    const response = await jsonRequest('/api/staff', adminCookie, {
      name: 'Sinta',
      username,
      role: 'staf',
      status: 'Aktif',
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ pin: string; pinExpiresAt: string; staff: { id: string } }>;
  }

  async function pinLogin(username: string, pin: string) {
    const response = await call('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    return { response, cookie };
  }

  it('opens a session that must set a password before using the app', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);

    const first = await pinLogin('sinta', created.pin);
    expect(first.response.status).toBe(200);
    expect(await first.response.json()).toMatchObject({ requiresPasswordChange: true });

    expect((await call('/api/sync/snapshot', { headers: { cookie: first.cookie } })).status).toBe(403);

    const set = await jsonRequest('/api/session/password', first.cookie, { password: 'sandi-baru-1' });
    expect(set.status).toBe(200);
    expect((await call('/api/sync/snapshot', { headers: { cookie: first.cookie } })).status).toBe(200);

    const signIn = await login('sinta', 'sandi-baru-1');
    expect(signIn.response.status).toBe(200);
  });

  it('refuses a PIN that was already used', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);

    expect((await pinLogin('sinta', created.pin)).response.status).toBe(200);
    const replay = await pinLogin('sinta', created.pin);
    expect(replay.response.status).toBe(401);
    expect(await replay.response.json()).toMatchObject({ error: 'invalid_pin' });
  });

  it('refuses an expired PIN', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);
    db.rawRun('UPDATE staff SET pin_expires_at = ? WHERE username = ?', '2020-01-01T00:00:00.000Z', 'sinta');

    const expired = await pinLogin('sinta', created.pin);
    expect(expired.response.status).toBe(401);
    expect(await expired.response.json()).toMatchObject({ error: 'pin_expired' });
  });

  it('invalidates the previous PIN when a new one is issued', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);

    const reissued = await jsonRequest(`/api/staff/${created.staff.id}/pin`, admin.cookie, {});
    expect(reissued.status).toBe(200);
    const fresh = await reissued.json();

    expect((await pinLogin('sinta', created.pin)).response.status).toBe(401);
    expect((await pinLogin('sinta', fresh.pin)).response.status).toBe(200);
  });

  it('refuses a PIN for a deactivated account and refuses a non-admin issuer', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);

    await send('PUT', `/api/staff/${created.staff.id}`, admin.cookie, {
      name: 'Sinta',
      username: 'sinta',
      role: 'staf',
      status: 'Tidak aktif',
    });
    expect((await pinLogin('sinta', created.pin)).response.status).toBe(403);

    const staff = await login('user');
    expect((await jsonRequest('/api/staff/staff-budi/pin', staff.cookie, {})).status).toBe(403);
  });

  it('rejects a too-short password on the forced screen', async () => {
    const admin = await login('admin');
    const created = await createAccount(admin.cookie);
    const { cookie } = await pinLogin('sinta', created.pin);

    expect((await jsonRequest('/api/session/password', cookie, { password: 'pendek' })).status).toBe(400);
    expect((await call('/api/sync/snapshot', { headers: { cookie } })).status).toBe(403);
  });
});

describe('online persistence', () => {
  it('persists a created item and shares it with another device', async () => {
    const admin = await login('admin');
    const operation = createOp();

    const created = await push(admin.cookie, 'device-1', [operation]);
    expect(created.body.results[0]).toMatchObject({ status: 'applied', itemId: operation.itemId });

    const otherDevice = await login('user');
    const snapshot = await call('/api/sync/snapshot', { headers: { cookie: otherDevice.cookie } });
    const body = await snapshot.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ nama: 'Paracetamol 500mg', hargaJual: 500, version: 1 });
  });

  it('persists an activation change made by editing the item', async () => {
    const admin = await login('admin');
    const operation = createOp();
    await push(admin.cookie, 'device-1', [operation]);

    const deactivate = await push(admin.cookie, 'device-1', [
      updateOp(operation.itemId, 1, { payload: basePayload({ status: 'Tidak aktif' }) }),
    ]);
    expect(deactivate.body.results[0]).toMatchObject({ status: 'applied', item: { status: 'Tidak aktif', version: 2 } });

    const snapshot = await call('/api/sync/snapshot', { headers: { cookie: admin.cookie } });
    const body = await snapshot.json();
    expect(body.items[0]).toMatchObject({ status: 'Tidak aktif', version: 2 });
  });

  it('rejects a duplicate item name', async () => {
    const admin = await login('admin');
    await push(admin.cookie, 'device-1', [createOp()]);

    const duplicate = await push(admin.cookie, 'device-1', [createOp({ payload: basePayload() })]);
    expect(duplicate.body.results[0]).toMatchObject({ status: 'rejected', message: 'duplicate_name' });
  });

  it('rejects an invalid payload', async () => {
    const admin = await login('admin');
    const invalid = await push(admin.cookie, 'device-1', [createOp({ payload: basePayload({ nama: '' }) })]);
    expect(invalid.body.results[0]).toMatchObject({ status: 'rejected', message: 'validation' });
  });
});

describe('idempotent sync', () => {
  it('applies a retried operation exactly once', async () => {
    const admin = await login('admin');
    const operation = createOp();

    const first = await push(admin.cookie, 'device-1', [operation]);
    const retry = await push(admin.cookie, 'device-1', [operation]);

    expect(first.body.results[0].status).toBe('applied');
    expect(retry.body.results[0].status).toBe('duplicate');
    expect(retry.body.results[0].item).toMatchObject({ id: operation.itemId, version: 1 });
    expect(db.raw('SELECT id FROM items')).toHaveLength(1);
    expect(db.raw("SELECT id FROM audit_events WHERE outcome = 'applied'")).toHaveLength(1);
  });

  it('keeps an independent operation when another in the batch fails', async () => {
    const admin = await login('admin');
    const invalid = createOp({ payload: basePayload({ nama: '' }) });
    const valid = createOp({ payload: basePayload({ nama: 'Amoxicilin' }) });

    const result = await push(admin.cookie, 'device-1', [invalid, valid]);
    expect(result.body.results.map((entry: { status: string }) => entry.status)).toEqual(['rejected', 'applied']);
  });
});

describe('conflict handling', () => {
  it('keeps both edits in audit history and lets the later device time win', async () => {
    const admin = await login('admin');
    const operation = createOp();
    await push(admin.cookie, 'device-1', [operation]);

    const early = updateOp(operation.itemId, 1, {
      deviceTime: iso(-60_000),
      payload: basePayload({ stok: 5, hargaJual: 600 }),
    });
    const late = updateOp(operation.itemId, 1, {
      deviceTime: iso(-1_000),
      payload: basePayload({ stok: 9, hargaJual: 700 }),
    });

    const first = await push(admin.cookie, 'device-1', [early]);
    const second = await push(admin.cookie, 'device-2', [late]);

    expect(first.body.results[0].status).toBe('applied');
    expect(second.body.results[0].status).toBe('applied');
    expect(second.body.results[0].item).toMatchObject({ stok: 9, hargaJual: 700, version: 3 });

    const outcomes = db
      .raw<{ outcome: string }>('SELECT outcome FROM audit_events ORDER BY server_time ASC, rowid ASC')
      .map((row) => row.outcome);
    expect(outcomes).toContain('applied');
    expect(outcomes).toContain('superseded');
  });

  it('holds a stale edit for review instead of silently overwriting', async () => {
    const admin = await login('admin');
    const operation = createOp();
    await push(admin.cookie, 'device-1', [operation]);

    await push(admin.cookie, 'device-1', [
      updateOp(operation.itemId, 1, { deviceTime: iso(-1_000), payload: basePayload({ stok: 4 }) }),
    ]);

    const stale = await push(admin.cookie, 'device-2', [
      updateOp(operation.itemId, 1, { deviceTime: iso(-5_000), payload: basePayload({ stok: 2 }) }),
    ]);

    expect(stale.body.results[0]).toMatchObject({ status: 'conflict', message: 'stale_edit' });
    const item = db.raw<{ stok: number }>('SELECT stok FROM items WHERE id = ?', operation.itemId)[0];
    expect(item.stok).toBe(4);
    expect(db.raw("SELECT id FROM audit_events WHERE outcome = 'conflict'")).toHaveLength(1);
  });

  it('holds equal device timestamps for review', async () => {
    const admin = await login('admin');
    const operation = createOp();
    await push(admin.cookie, 'device-1', [operation]);

    const sameTime = iso(-2_000);
    await push(admin.cookie, 'device-1', [
      updateOp(operation.itemId, 1, { deviceTime: sameTime, payload: basePayload({ stok: 3 }) }),
    ]);

    const tie = await push(admin.cookie, 'device-2', [
      updateOp(operation.itemId, 1, { deviceTime: sameTime, payload: basePayload({ stok: 8 }) }),
    ]);

    expect(tie.body.results[0]).toMatchObject({ status: 'conflict', message: 'ambiguous_order' });
  });

  it('holds operations whose device clock is far ahead of the server', async () => {
    const admin = await login('admin');
    const skewed = await push(admin.cookie, 'device-1', [
      createOp({ deviceTime: iso(60 * 60 * 1000) }),
    ]);

    expect(skewed.body.results[0]).toMatchObject({ status: 'conflict', message: 'clock_skew' });
  });
});

describe('account deactivation', () => {
  const offlineWork = (authorId: string, deviceTime: string, nama: string) =>
    createOp({ authorId, deviceTime, payload: basePayload({ nama }) });

  it('accepts work recorded before deactivation and cancels work recorded after it', async () => {
    const staff = await login('user');

    db.rawRun('UPDATE staff SET status = ?, deactivated_at = ? WHERE id = ?', 'Tidak aktif', iso(), 'staff-budi');

    const accepted = await push(staff.cookie, 'device-budi', [
      offlineWork('staff-budi', iso(-120_000), 'Betametason'),
    ]);
    expect(accepted.body.results[0].status).toBe('applied');

    const rejected = await push(staff.cookie, 'device-budi', [
      offlineWork('staff-budi', iso(120_000), 'Antasida'),
    ]);
    expect(rejected.body.results[0]).toMatchObject({ status: 'cancelled', message: 'account_deactivated' });
    expect(db.raw('SELECT id FROM items')).toHaveLength(1);
  });

  it('cancels queued work of a deactivated account even when an active account sends it', async () => {
    const admin = await login('admin');
    const queued = offlineWork('staff-budi', iso(60_000), 'Antasida');

    const deactivate = await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });
    expect(deactivate.status).toBe(200);

    // The reported bug: another, active account signs in on the same device and
    // the queue still carried the deactivated account's work.
    const pushed = await push(admin.cookie, 'device-budi', [queued]);
    expect(pushed.body.results[0]).toMatchObject({ status: 'cancelled', message: 'account_deactivated' });
    expect(db.raw('SELECT id FROM items')).toHaveLength(0);

    const ledger = db.raw<{ author_id: string; status: string }>(
      'SELECT author_id, status FROM sync_operations WHERE operation_id = ?',
      queued.operationId,
    )[0];
    expect(ledger).toMatchObject({ author_id: 'staff-budi', status: 'cancelled' });

    const audit = db.raw<{ staff_id: string; note: string }>(
      "SELECT staff_id, note FROM audit_events WHERE outcome = 'rejected'",
    )[0];
    expect(audit.staff_id).toBe('staff-budi');
    expect(audit.note).toContain('account_deactivated');
    expect(audit.note).toContain('pushed_by:staff-admin');
  });

  it('keeps work the account recorded before deactivation, whoever sends it', async () => {
    const admin = await login('admin');
    const recordedBefore = offlineWork('staff-budi', iso(-90_000), 'Antasida');

    await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });

    const pushed = await push(admin.cookie, 'device-budi', [recordedBefore]);
    expect(pushed.body.results[0]).toMatchObject({ status: 'applied' });

    const audit = db.raw<{ note: string }>("SELECT note FROM audit_events WHERE entity = 'item' AND outcome = 'applied'")[0];
    expect(audit.note).toContain('operation_before_deactivation');
    expect(audit.note).toContain('pushed_by:staff-admin');
  });

  it('clears the deactivation time on reactivation and records a fresh one afterwards', async () => {
    const admin = await login('admin');
    const base = { name: 'Budi', username: 'user', role: 'staf' as const };
    const deactivatedAt = () =>
      db.raw<{ deactivated_at: string | null }>('SELECT deactivated_at FROM staff WHERE id = ?', 'staff-budi')[0]
        .deactivated_at;

    expect((await send('PUT', '/api/staff/staff-budi', admin.cookie, { ...base, status: 'Tidak aktif' })).status).toBe(200);
    const first = deactivatedAt();
    expect(first).toBeTruthy();

    expect((await send('PUT', '/api/staff/staff-budi', admin.cookie, { ...base, status: 'Aktif' })).status).toBe(200);
    expect(deactivatedAt()).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await send('PUT', '/api/staff/staff-budi', admin.cookie, { ...base, status: 'Tidak aktif' });
    const second = deactivatedAt();
    expect(second).toBeTruthy();
    expect(Date.parse(String(second))).toBeGreaterThan(Date.parse(String(first)));
  });

  it('closes ledger rows a deactivated account left in flight', async () => {
    const admin = await login('admin');
    db.rawRun(
      `INSERT INTO sync_operations
         (operation_id, staff_id, device_id, author_id, entity, entity_id, action, device_time, server_time, status, message, response_json)
       VALUES (?, ?, ?, ?, 'item', ?, 'create', ?, ?, 'processing', '', '{}')`,
      'op-in-flight',
      'staff-budi',
      'device-budi',
      'staff-budi',
      'item-in-flight',
      iso(),
      iso(),
    );

    await send('PUT', '/api/staff/staff-budi', admin.cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });

    const row = db.raw<{ status: string }>('SELECT status FROM sync_operations WHERE operation_id = ?', 'op-in-flight')[0];
    expect(row.status).toBe('cancelled');

    const audit = db.raw<{ note: string }>("SELECT note FROM audit_events WHERE entity = 'staff' AND action = 'update'")[0];
    expect(audit.note).toContain('cancelled_pending_operations:1');
  });

  it('rejects work whose author is unknown or missing', async () => {
    const admin = await login('admin');

    const unknown = await push(admin.cookie, 'device-1', [createOp({ authorId: 'staff-hilang' })]);
    expect(unknown.body.results[0]).toMatchObject({ status: 'rejected', message: 'unknown_author' });

    const missing = await push(admin.cookie, 'device-1', [createOp({ authorId: '' })]);
    expect(missing.body.results[0]).toMatchObject({ status: 'rejected', message: 'invalid_author_id' });
  });
});

describe('recovery codes', () => {
  async function generateCodes(cookie: string, staffId: string) {
    const response = await jsonRequest(`/api/staff/${staffId}/recovery-codes`, cookie, {});
    const body = (await response.json()) as { codes?: string[] };
    return { status: response.status, codes: body.codes ?? [] };
  }

  async function reset(username: string, code: string, newPassword = 'passwordbaru123') {
    const response = await call('/api/recovery/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, code, newPassword }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function adminCookie() {
    const { cookie } = await login('admin');
    return cookie;
  }

  it('issues eight codes and lets a staff member sign in with one of them', async () => {
    const cookie = await adminCookie();
    const generated = await generateCodes(cookie, 'staff-budi');
    expect(generated.status).toBe(200);
    expect(generated.codes).toHaveLength(8);

    const result = await reset('user', generated.codes[0]);
    expect(result.status).toBe(200);

    const signedIn = await login('user', 'passwordbaru123');
    expect(signedIn.response.status).toBe(200);
    expect(signedIn.cookie).not.toBe('');
  });

  it('accepts a code only once', async () => {
    const cookie = await adminCookie();
    const { codes } = await generateCodes(cookie, 'staff-budi');

    expect((await reset('user', codes[0])).status).toBe(200);
    expect((await reset('user', codes[0], 'passwordlain123')).status).toBe(401);
  });

  it('rejects an unknown code and leaves the password unchanged', async () => {
    await adminCookie();
    const result = await reset('user', 'AAAA-AAAA-AAAA');
    expect(result.status).toBe(401);

    const signedIn = await login('user');
    expect(signedIn.response.status).toBe(200);
  });

  it('ends existing sessions when a recovery code is used', async () => {
    const cookie = await adminCookie();
    const { codes } = await generateCodes(cookie, 'staff-budi');
    const staffSession = await login('user');

    expect((await reset('user', codes[1])).status).toBe(200);

    const after = await call('/api/items', { headers: { cookie: staffSession.cookie } });
    expect(after.status).toBe(401);
  });

  it('refuses recovery for a deactivated account', async () => {
    const cookie = await adminCookie();
    await send('PUT', '/api/staff/staff-budi', cookie, {
      name: 'Budi',
      username: 'user',
      role: 'staf',
      status: 'Tidak aktif',
    });
    const { codes } = await generateCodes(cookie, 'staff-budi');
    const result = await reset('user', codes[0]);
    expect(result.status).toBe(403);
  });

  it('only lets an admin generate codes', async () => {
    const staffSession = await login('user');
    const generated = await generateCodes(staffSession.cookie, 'staff-budi');
    expect(generated.status).toBe(403);
  });

  it('does not accept a code that belongs to another account', async () => {
    const cookie = await adminCookie();
    const { codes } = await generateCodes(cookie, 'staff-admin');
    const result = await reset('user', codes[0]);
    expect(result.status).toBe(401);
  });
});

describe('reference data', () => {
  function referenceOp(
    entity: string,
    payload: Record<string, unknown> = {},
    overrides: Record<string, unknown> = {},
  ) {
    return {
      operationId: crypto.randomUUID(),
      entity,
      action: 'create',
      itemId: crypto.randomUUID(),
      authorId: 'staff-admin',
      baseVersion: 0,
      deviceTime: iso(),
      payload: { nama: 'Lemari depan', status: 'Aktif', ...payload },
      ...overrides,
    };
  }

  it('creates every reference list and returns it in the snapshot', async () => {
    const admin = await login('admin');
    const operations = [
      referenceOp('cabinet', { nama: 'Lemari depan' }),
      referenceOp('payment_method', { nama: 'Tunai' }),
      referenceOp('doctor', { nama: 'dr. Andi' }),
      referenceOp('supplier', { nama: 'PT Sehat' }),
    ];

    const pushed = await push(admin.cookie, 'device-1', operations);
    expect(pushed.body.results.map((result: { status: string }) => result.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
    ]);

    const snapshot = await call('/api/sync/snapshot', { headers: { cookie: admin.cookie } });
    const body = await snapshot.json();
    expect(body.cabinets).toMatchObject([{ nama: 'Lemari depan', status: 'Aktif', version: 1 }]);
    expect(body.paymentMethods[0]).toMatchObject({ nama: 'Tunai' });
    expect(body.doctors[0]).toMatchObject({ nama: 'dr. Andi' });
    expect(body.suppliers[0]).toMatchObject({ nama: 'PT Sehat' });
  });

  it('refuses a duplicate name in one list but allows the same name in another', async () => {
    const admin = await login('admin');
    await push(admin.cookie, 'device-1', [referenceOp('doctor', { nama: 'dr. Andi' })]);

    const duplicate = await push(admin.cookie, 'device-1', [referenceOp('doctor', { nama: 'DR. ANDI' })]);
    expect(duplicate.body.results[0]).toMatchObject({ status: 'rejected', message: 'duplicate_name' });

    const otherList = await push(admin.cookie, 'device-1', [referenceOp('supplier', { nama: 'dr. Andi' })]);
    expect(otherList.body.results[0].status).toBe('applied');
  });

  it('deactivates a cabinet without deleting it', async () => {
    const admin = await login('admin');
    const created = referenceOp('cabinet', { nama: 'Lemari belakang' });
    await push(admin.cookie, 'device-1', [created]);

    const update = {
      ...created,
      operationId: crypto.randomUUID(),
      action: 'update',
      baseVersion: 1,
      deviceTime: iso(1000),
      payload: { nama: 'Lemari belakang', status: 'Tidak aktif' },
    };
    const pushed = await push(admin.cookie, 'device-1', [update]);
    expect(pushed.body.results[0]).toMatchObject({ status: 'applied', version: 2 });
    expect(db.raw('SELECT status FROM cabinets')[0]).toMatchObject({ status: 'Tidak aktif' });
  });

  it('lets only an admin save the pharmacy profile', async () => {
    const settingsOp = (authorId: string) => ({
      operationId: crypto.randomUUID(),
      entity: 'settings',
      action: 'update',
      itemId: 'apotek',
      authorId,
      baseVersion: 1,
      deviceTime: iso(),
      payload: { namaApotek: 'Apotek Sehat', alamat: 'Jl. Mawar 1' },
    });

    const staff = await login('user');
    const refused = await push(staff.cookie, 'device-1', [settingsOp('staff-budi')]);
    expect(refused.body.results[0]).toMatchObject({ status: 'rejected', message: 'forbidden' });

    const admin = await login('admin');
    const applied = await push(admin.cookie, 'device-1', [settingsOp('staff-admin')]);
    expect(applied.body.results[0].status).toBe('applied');

    const snapshot = await call('/api/sync/snapshot', { headers: { cookie: admin.cookie } });
    expect((await snapshot.json()).settings).toMatchObject({
      namaApotek: 'Apotek Sehat',
      alamat: 'Jl. Mawar 1',
      version: 2,
    });
  });
});

describe('goods and services', () => {
  it('stores a service without unit, purchase price, stock, or cabinet', async () => {
    const admin = await login('admin');
    const operation = createOp({
      payload: basePayload({
        type: 'jasa',
        nama: 'Suntik vitamin',
        satuan: 'Tablet',
        hargaModal: 5000,
        hargaJual: 15000,
        stok: 7,
        lemari: 'Lemari depan',
      }),
    });

    const pushed = await push(admin.cookie, 'device-1', [operation]);
    expect(pushed.body.results[0]).toMatchObject({
      status: 'applied',
      item: { type: 'jasa', satuan: '', hargaModal: 0, stok: 0, lemari: '', hargaJual: 15000 },
    });

    const snapshot = await call('/api/sync/snapshot', { headers: { cookie: admin.cookie } });
    expect((await snapshot.json()).items[0]).toMatchObject({ type: 'jasa', nama: 'Suntik vitamin' });
  });

  it('still requires a unit for goods and rejects an unknown type', async () => {
    const admin = await login('admin');

    const withoutUnit = await push(admin.cookie, 'device-1', [createOp({ payload: basePayload({ satuan: '' }) })]);
    expect(withoutUnit.body.results[0]).toMatchObject({ status: 'rejected', message: 'validation' });

    const unknownType = await push(admin.cookie, 'device-1', [createOp({ payload: basePayload({ type: 'paket' }) })]);
    expect(unknownType.body.results[0]).toMatchObject({ status: 'rejected', message: 'validation' });
  });

  it('keeps one name space across goods and services', async () => {
    const admin = await login('admin');
    await push(admin.cookie, 'device-1', [createOp({ payload: basePayload({ nama: 'Vitamin C' }) })]);

    const duplicate = await push(admin.cookie, 'device-1', [
      createOp({ payload: basePayload({ type: 'jasa', nama: 'vitamin c', hargaJual: 10000 }) }),
    ]);
    expect(duplicate.body.results[0]).toMatchObject({ status: 'rejected', message: 'duplicate_name' });
  });
});
