const Kromafi = {
  register(handler) {
    document.addEventListener('alpine:init', handler);
  }
};

// Sync outbox: every document saved on this device waits here until a central server exists.
const SYNC_QUEUE_KEY = 'kromafi.syncQueue';

const readSyncQueue = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Gagal membaca antrean sinkronisasi.', error);
    return [];
  }
};

const enqueueSync = (entry) => {
  const queue = readSyncQueue();
  const record = {
    id: `${entry.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: entry.type,
    refId: entry.refId ?? null,
    label: entry.label || '',
    waktu: new Date().toISOString()
  };
  queue.push(record);
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Gagal menyimpan antrean sinkronisasi.', error);
    return null;
  }
  window.dispatchEvent(new CustomEvent('sync-queue-updated'));
  return record;
};

const STAFF_STORAGE_KEY = 'kromafi.petugas';
const LOGIN_ATTEMPTS_STORAGE_KEY = 'kromafi.loginAttempts';
const PASSWORD_HASH_SCHEME = 'PBKDF2-SHA-256';
const PASSWORD_HASH_ITERATIONS = 600000;
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const DEFAULT_STAFF_LIST = [
  { id: 1, nama: 'Admin', email: 'admin@email.com', role: 'admin', status: 'Aktif' },
  { id: 2, nama: 'Staf', email: 'user@email.com', role: 'staf', status: 'Aktif' }
];
const DEFAULT_STAFF_PASSWORDS = {
  'admin@email.com': 'admin',
  'user@email.com': 'user'
};

const staffLoginKey = (staff) => String((staff && (staff.email || staff.username)) || '').trim().toLocaleLowerCase('id');

const findStaffByEmail = (list, email) => {
  const key = String(email || '').trim().toLocaleLowerCase('id');
  if (!key) return null;
  return (Array.isArray(list) ? list : []).find(item => staffLoginKey(item) === key) || null;
};

const readStaffList = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAFF_STORAGE_KEY) || 'null');
    if (Array.isArray(parsed)) return parsed;
  } catch (error) {
    console.error('Gagal membaca data petugas.', error);
  }
  return DEFAULT_STAFF_LIST.map(item => ({ ...item }));
};

const bytesToHex = (bytes) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (value) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(String(value || ''))) return null;
  return new Uint8Array(String(value).match(/.{2}/g).map(byte => parseInt(byte, 16)));
};

const hashStaffPassword = async (password) => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto tidak tersedia untuk menyimpan password dengan aman.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hash = await globalThis.crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: PASSWORD_HASH_ITERATIONS,
    hash: 'SHA-256'
  }, key, 256);
  return {
    passwordScheme: PASSWORD_HASH_SCHEME,
    passwordIterations: PASSWORD_HASH_ITERATIONS,
    passwordSalt: bytesToHex(salt),
    passwordHash: bytesToHex(new Uint8Array(hash))
  };
};

const verifyStaffPassword = async (staff, password) => {
  if (!staff || staff.passwordScheme !== PASSWORD_HASH_SCHEME) return false;
  const salt = hexToBytes(staff.passwordSalt);
  const expected = hexToBytes(staff.passwordHash);
  const iterations = Number(staff.passwordIterations);
  if (!salt || salt.length !== 16 || !expected || expected.length !== 32 || iterations !== PASSWORD_HASH_ITERATIONS) return false;
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto tidak tersedia untuk memverifikasi password.');
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const actual = new Uint8Array(await globalThis.crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations,
    hash: 'SHA-256'
  }, key, expected.length * 8));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
};

const ensureStaffAccounts = async () => {
  let stored;
  try {
    const raw = localStorage.getItem(STAFF_STORAGE_KEY);
    stored = raw === null ? null : JSON.parse(raw);
  } catch (error) {
    console.error('Gagal membaca data petugas untuk migrasi.', error);
    throw new Error('Data petugas tidak dapat dibaca.');
  }

  let staffList;
  let changed = false;
  if (stored === null) {
    staffList = [];
    for (const staff of DEFAULT_STAFF_LIST) {
      const credential = await hashStaffPassword(DEFAULT_STAFF_PASSWORDS[staff.email]);
      staffList.push({ ...staff, ...credential });
    }
    changed = true;
  } else if (Array.isArray(stored)) {
    staffList = [];
    for (const source of stored) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error('Data petugas berisi akun yang tidak valid.');
      }
      const staff = { ...source };
      const oldRole = String(staff.role || '').trim().toLocaleLowerCase('id');
      const newRole = oldRole === 'admin' ? 'admin' : 'staf';
      if (staff.role !== newRole) {
        staff.role = newRole;
        changed = true;
      }
      if (staff.email === 'user@email.com' && staff.nama === 'User') {
        staff.nama = 'Staf';
        changed = true;
      }
      if (staff.passwordScheme !== PASSWORD_HASH_SCHEME || !staff.passwordSalt || !staff.passwordHash) {
        const plainPassword = staff.password ?? DEFAULT_STAFF_PASSWORDS[staffLoginKey(staff)];
        if (plainPassword === undefined || plainPassword === null || String(plainPassword) === '') {
          throw new Error(`Password akun ${staffLoginKey(staff) || staff.id} tidak tersedia untuk migrasi.`);
        }
        Object.assign(staff, await hashStaffPassword(String(plainPassword)));
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(staff, 'password')) {
        delete staff.password;
        changed = true;
      }
      staffList.push(staff);
    }
  } else {
    throw new Error('Data petugas harus berupa daftar akun.');
  }

  if (changed) {
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staffList));
    } catch (error) {
      console.error('Gagal menyimpan migrasi akun petugas.', error);
      throw new Error('Migrasi akun gagal disimpan.');
    }
  }

  const loggedInUser = String(localStorage.getItem('kromafi.loggedInUser') || '').trim().toLocaleLowerCase('id');
  const activeStaff = staffList.find(staff => staffLoginKey(staff) === loggedInUser || String(staff.username || '').trim().toLocaleLowerCase('id') === loggedInUser);
  if (activeStaff && activeStaff.email && activeStaff.email !== loggedInUser) {
    localStorage.setItem('kromafi.loggedInUser', staffLoginKey(activeStaff));
  }
  return changed;
};

const readLoginAttempts = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Data percobaan login harus berupa objek.');
    }
    return parsed;
  } catch (error) {
    console.error('Gagal membaca data percobaan login.', error);
    throw new Error('Data keamanan login tidak dapat dibaca.');
  }
};

const loginLockout = (email, now = Date.now()) => {
  const key = String(email || '').trim().toLocaleLowerCase('id');
  const record = readLoginAttempts()[key];
  if (!record || !Number.isFinite(record.lockedUntil) || record.lockedUntil <= now) return 0;
  return record.lockedUntil;
};

const recordFailedLogin = (email, now = Date.now()) => {
  const key = String(email || '').trim().toLocaleLowerCase('id');
  const attempts = readLoginAttempts();
  const previous = attempts[key];
  const withinWindow = previous && Number.isFinite(previous.firstAttemptAt)
    && Number.isInteger(previous.count) && previous.count > 0
    && now >= previous.firstAttemptAt
    && now - previous.firstAttemptAt < LOGIN_ATTEMPT_WINDOW_MS;
  const count = withinWindow ? previous.count + 1 : 1;
  attempts[key] = {
    count,
    firstAttemptAt: withinWindow ? previous.firstAttemptAt : now,
    lockedUntil: count >= LOGIN_ATTEMPT_LIMIT ? now + LOGIN_ATTEMPT_WINDOW_MS : 0
  };
  try {
    localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  } catch (error) {
    console.error('Gagal menyimpan batas percobaan login.', error);
    throw new Error('Batas percobaan login tidak dapat disimpan.');
  }
  return attempts[key];
};

const clearFailedLogin = (email) => {
  const key = String(email || '').trim().toLocaleLowerCase('id');
  const attempts = readLoginAttempts();
  if (!Object.prototype.hasOwnProperty.call(attempts, key)) return;
  delete attempts[key];
  try {
    localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  } catch (error) {
    console.error('Gagal menghapus data percobaan login.', error);
    throw new Error('Status percobaan login tidak dapat diperbarui.');
  }
};

const defaultDistributorList = [
  { id: 1, nama: 'BSP', status: 'Aktif' },
  { id: 2, nama: 'Enseval', status: 'Aktif' },
  { id: 3, nama: 'MPI', status: 'Tidak aktif' }
];
const readDistributorList = () => {
  const stored = localStorage.getItem('kromafi.distributors');
  if (stored === null) return defaultDistributorList.map(item => ({ ...item }));
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error('Data distributor harus berupa daftar.');
  return parsed;
};
