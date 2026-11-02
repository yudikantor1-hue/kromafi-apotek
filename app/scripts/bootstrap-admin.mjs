#!/usr/bin/env node
// One-time bootstrap: create the first admin account in an empty database.
//
// The development seed (worker/seed/dev.sql) contains published demo passwords
// and must never be applied to a real database. This script exists so the first
// real admin is created from a password the operator types, which is hashed
// immediately and never written to any file or log.
//
// Usage:
//   node scripts/bootstrap-admin.mjs                 # local D1 database
//   node scripts/bootstrap-admin.mjs --remote        # deployed database (needs an account)
//   node scripts/bootstrap-admin.mjs --username admin --name "Nama"   # password still prompted
//   printf '%s' "$PW" | node scripts/bootstrap-admin.mjs --username admin --name N --password-stdin
//
// Flags: --remote, --persist-to <dir>, --username <username>, --name <name>, --password-stdin,
//        --force, --help

import { execFileSync } from 'node:child_process';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

// Must match PASSWORD_ITERATIONS in worker/src/password.ts. workerd refuses
// anything above 100,000 iterations, so that is the platform maximum.
const ITERATIONS = 100_000;
const MAX_SUPPORTED_ITERATIONS = 100_000;
// Resolve everything from this file's own location so the script works no matter
// which directory the operator happens to be standing in.
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(APP_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function fail(message, code = 1) {
  console.error(`\n${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { remote: false, persistTo: null, username: null, name: null, passwordStdin: false, force: false, reset: false };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    let inlineValue = null;
    if (arg.startsWith('--') && arg.includes('=')) {
      const split = arg.indexOf('=');
      inlineValue = arg.slice(split + 1);
      arg = arg.slice(0, split);
    }
    const takeValue = () => (inlineValue !== null ? inlineValue : argv[++index] ?? null);
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Create the first admin account.',
          '',
          '  --remote              write to the deployed D1 database instead of the local one',
          '  --persist-to <dir>    local persistence directory (defaults to .wrangler/state)',
          '  --username <username> skip the username prompt',
          '  --name <name>         skip the name prompt',
          '  --password-stdin      read the password from stdin instead of prompting',
          '  --reset               replace the password of an existing account (also ends its sessions)',
          '  --force               create the admin even when one already exists',
        ].join('\n'),
      );
      process.exit(0);
    } else if (arg === '--remote') options.remote = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--password-stdin') options.passwordStdin = true;
    else if (arg === '--reset') options.reset = true;
    else if (arg === '--persist-to') options.persistTo = takeValue();
    else if (arg === '--username') options.username = takeValue();
    else if (arg === '--name') options.name = takeValue();
    else fail(`Argumen tidak dikenal: ${arg}`, 2);
  }
  if (options.remote && options.persistTo) fail('--remote dan --persist-to tidak bisa dipakai bersama.', 2);
  return options;
}

function wrangler(args, options) {
  const flags = ['d1', 'execute', 'DB', options.remote ? '--remote' : '--local'];
  if (!options.remote && options.persistTo) flags.push('--persist-to', options.persistTo);
  return execFileSync(process.execPath, [WRANGLER, ...flags, ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function queryAll(sql, options) {
  const output = wrangler(['--json', '--command', sql], options);
  const start = output.indexOf('[');
  if (start === -1) throw new Error('Output wrangler tidak dapat dibaca.');
  const parsed = JSON.parse(output.slice(start));
  if (!parsed[0] || parsed[0].success !== true) throw new Error('Query gagal dijalankan.');
  return parsed[0].results ?? [];
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

function validateName(name) {
  const trimmed = name.trim();
  if (trimmed.length < 1) return { ok: false, message: 'Nama tidak boleh kosong.' };
  if (trimmed.length > 80) return { ok: false, message: 'Nama maksimal 80 karakter.' };
  if (/[\u0000-\u001f]/.test(trimmed)) return { ok: false, message: 'Nama mengandung karakter kontrol.' };
  return { ok: true, value: trimmed };
}

function validateUsername(username) {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return { ok: false, message: 'Username harus 3-32 karakter.' };
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(trimmed)) {
    return { ok: false, message: 'Username hanya boleh huruf kecil, angka, titik, garis bawah, dan strip.' };
  }
  if (trimmed.includes("'")) return { ok: false, message: 'Username mengandung karakter terlarang.' };
  return { ok: true, value: trimmed };
}

function validatePassword(password) {
  if (password.length < 8) return { ok: false, message: 'Password minimal 8 karakter.' };
  if (password.length > 200) return { ok: false, message: 'Password maksimal 200 karakter.' };
  return { ok: true, value: password };
}

async function readPassword(options) {
  if (options.passwordStdin) return readFileSync(0, 'utf8').split(/\r?\n/)[0];
  const password = await ask('Password (tidak akan ditampilkan): ', true);
  const confirm = await ask('Ulangi password: ', true);
  if (confirm !== password) fail('Password tidak sama. Tidak ada perubahan yang disimpan.');
  return password;
}

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    const bytes = randomBytes(12);
    let raw = '';
    for (const byte of bytes) raw += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(`${salt}:${raw}`)
      .digest('hex');
    codes.push({ code, hash, salt });
  }
  return codes;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return { hash: hash.toString('hex'), salt: salt.toString('hex'), iterations: ITERATIONS };
}

function ask(question, hidden = false) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Input interaktif dibutuhkan. Jalankan di terminal, atau pakai --username dan --name.'));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => {
      if (!muted) original(chunk);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    if (hidden) muted = true;
  });
}

async function resetPassword(options, target) {
  let username = options.username;
  if (!username) username = await ask('Username akun yang direset: ');
  const usernameCheck = validateUsername(username ?? '');
  if (!usernameCheck.ok) fail(usernameCheck.message);

  let rows;
  try {
    rows = queryAll(
      `SELECT id, username, role, password_iterations FROM staff WHERE username = '${escapeSql(usernameCheck.value)}'`,
      options,
    );
  } catch (error) {
    fail(`Gagal membaca ${target}.\n${String(error.stderr ?? error.message ?? error).trim()}`);
  }

  const account = rows[0];
  if (!account) fail(`Tidak ada akun dengan username ${usernameCheck.value} di ${target}.`);

  const password = await readPassword(options);
  const passwordCheck = validatePassword(password ?? '');
  if (!passwordCheck.ok) fail(passwordCheck.message);

  const credential = hashPassword(password);
  const now = new Date().toISOString();
  // Two statements, sent separately: D1 rejects a multi-statement batch that
  // touches a foreign-key parent, and sessions reference staff.
  const statements = [
    `DELETE FROM sessions WHERE staff_id = '${escapeSql(account.id)}'`,
    `UPDATE staff SET password_hash = '${credential.hash}', password_salt = '${credential.salt}', ` +
      `password_iterations = ${credential.iterations}, updated_at = '${now}' ` +
      `WHERE id = '${escapeSql(account.id)}'`,
  ];

  for (const statement of statements) {
    try {
      wrangler(['--command', statement], options);
    } catch (error) {
      fail(`Gagal menyimpan password baru.\n${String(error.stderr ?? error.message ?? error).trim()}`);
    }
  }

  const previousIterations = Number(account.password_iterations ?? 0);
  console.log(`\nPassword diperbarui di ${target}.`);
  console.log(`  ${account.username} (${account.id})`);
  if (previousIterations > MAX_SUPPORTED_ITERATIONS) {
    console.log(`  Iterasi lama ${previousIterations} melebihi batas runtime; sekarang ${credential.iterations}.`);
  }
  console.log('  Sesi lama dihentikan, jadi perangkat yang masih masuk harus login ulang.\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = options.remote ? 'database Cloudflare (remote)' : 'database lokal';

  let existing;
  try {
    existing = queryAll("SELECT COUNT(*) AS admins FROM staff WHERE role = 'admin'", options);
  } catch (error) {
    const message = String(error.stderr ?? error.message ?? error);
    if (/no such table/i.test(message)) {
      fail(`Tabel staff belum ada di ${target}. Jalankan migrasi dulu:\n  npm run db:migrate:local${options.remote ? '  (atau: npx wrangler d1 migrations apply DB --remote)' : ''}`);
    }
    fail(`Gagal membaca ${target}.\n${message.trim()}`);
  }

  if (options.reset) {
    await resetPassword(options, target);
    return;
  }

  const admins = Number(existing[0]?.admins ?? 0);
  if (admins > 0 && !options.force) {
    fail(
      `Sudah ada ${admins} admin di ${target}; bootstrap ini hanya untuk database kosong.\n` +
        'Kelola akun lewat layar Petugas di aplikasi. Pakai --force hanya jika Anda yakin.',
    );
  }

  let username = options.username;
  if (!username) username = await ask('Username admin: ');
  const usernameCheck = validateUsername(username ?? '');
  if (!usernameCheck.ok) fail(usernameCheck.message);

  let name = options.name;
  if (!name) name = await ask('Nama admin: ');
  const nameCheck = validateName(name ?? '');
  if (!nameCheck.ok) fail(nameCheck.message);

  const password = await readPassword(options);
  const passwordCheck = validatePassword(password ?? '');
  if (!passwordCheck.ok) fail(passwordCheck.message);

  const credential = hashPassword(password);
  const id = `staff-${randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const sql =
    'INSERT INTO staff (id, name, username, role, status, password_hash, password_salt, password_iterations, deactivated_at, created_at, updated_at) VALUES (' +
    [
      `'${escapeSql(id)}'`,
      `'${escapeSql(nameCheck.value)}'`,
      `'${escapeSql(usernameCheck.value)}'`,
      `'admin'`,
      `'Aktif'`,
      `'${credential.hash}'`,
      `'${credential.salt}'`,
      String(credential.iterations),
      'NULL',
      `'${now}'`,
      `'${now}'`,
    ].join(', ') +
    ')';

  try {
    wrangler(['--command', sql], options);
  } catch (error) {
    fail(`Gagal menyimpan admin.\n${String(error.stderr ?? error.message ?? error).trim()}`);
  }

  const recoveryCodes = generateRecoveryCodes();
  for (const entry of recoveryCodes) {
    try {
      wrangler(
        [
          '--command',
          `INSERT INTO recovery_codes (id, staff_id, code_hash, code_salt, used_at, created_at) VALUES ('${randomBytes(8).toString('hex')}', '${escapeSql(id)}', '${entry.hash}', '${entry.salt}', NULL, '${now}')`,
        ],
        options,
      );
    } catch (error) {
      fail(`Admin dibuat, tetapi kode pemulihan gagal disimpan.\n${String(error.stderr ?? error.message ?? error).trim()}`);
    }
  }

  const verify = queryAll("SELECT id, username FROM staff WHERE role = 'admin' ORDER BY created_at", options);
  console.log(`\nAdmin dibuat di ${target}.`);
  console.log(`  ${verify.map((row) => `${row.username} (${row.id})`).join('\n  ')}`);
  console.log('\nKode pemulihan (hanya ditampilkan sekali — catat atau cetak sekarang):');
  for (const entry of recoveryCodes) console.log(`  ${entry.code}`);
  console.log(
    '\nPassword tidak disimpan di mana pun. Masuk lewat aplikasi, lalu buat akun petugas lain dari layar Petugas.\n' +
      'Setiap kode hanya bisa dipakai sekali, lewat tombol "Lupa password?" di layar login.\n',
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
