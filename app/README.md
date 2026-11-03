# Kromafi Apotek — production application

This directory holds the production application. It implements eight of the client-approved
menus — **Barang, Jasa, Petugas, Lemari, Metode pembayaran, Dokter, Distributor, and Profil
apotek** — on one offline engine: staff sign-in, staff administration, list/search/create/edit/
activate, offline pending work, idempotent synchronization, conflict history, and encrypted
export/import.

It **is deployed as a trial** to the client's own Cloudflare account at
https://kromafi-apotek.kromafi.workers.dev, with D1 `kromafi-apotek` and migrations `0001`–`0009`
applied. It is not a production launch yet: the custom domain, a second admin, and data onboarding
are still open (P1 in [../PLAN.md](../PLAN.md)).

The approved prototype in [../UI/](../UI) remains the visual and workflow baseline. This app does
not modify or import the prototype.

## Structure

```
app/
├─ index.html                 Vite entry HTML
├─ public/
│  ├─ sw.js                   Service worker: app-shell caching (no external CDN)
│  ├─ manifest.webmanifest    PWA manifest
│  └─ icon.svg
├─ src/                       React PWA
│  ├─ App.tsx                 Session, setup, sync, and Barang actions
│  ├─ components/             Login, Setup, Shell, Barang, Jasa, reference lists, Profil apotek, Petugas, Export modal, icons
│  ├─ lib/
│  │  ├─ api.ts               Typed API client
│  │  ├─ idb.ts               IndexedDB: meta, items, outbox, credentials
│  │  ├─ offlineAuth.ts       Local PBKDF2 credential provisioning/verification
│  │  ├─ sync.ts              Pending overlay, queueing, push + snapshot
│  │  └─ exportImport.ts      Encrypted, versioned Barang package
│  └─ styles.css              Brand stylesheet (no Tailwind CDN)
├─ worker/
│  ├─ migrations/              D1 schema, 0001–0009, applied in order
│  ├─ seed/dev.sql              Local development accounts only
│  └─ src/                      Worker API: auth, permissions, items, sync, staff, audit
├─ scripts/dev-api.mjs          Local API fallback (see below)
├─ tests/                       Worker + offline logic tests (Vitest)
└─ wrangler.jsonc               Worker/D1/Pages configuration
```

## Local setup

Requires Node 22 or newer (developed on Node 24) and npm.

```bash
cd app
npm install

# Terminal 1 — API on http://127.0.0.1:8787
npm run dev:api

# Terminal 2 — PWA on http://localhost:5173 (proxies /api to the API)
npm run dev
```

Open `http://localhost:5173`. Local development accounts (seeded on first start, matching the
prototype):

| Username | Password | Role |
|---|---|---|
| `admin` | `admin` | admin |
| `user` | `user` | staf |

The local database lives in `.wrangler/dev/kromafi.db` and is git-ignored. Delete that file to reset.

### About `npm run dev:api`

`wrangler dev` is the Cloudflare-accurate way to run the Worker (`npm run dev:cf`), and it is the
preferred local server: it runs the real `workerd` runtime against a real local D1 database.

```bash
npm run db:migrate:local   # apply migrations to the local D1 database
npm run db:seed:local      # insert the development staff accounts
npm run dev:cf             # Worker on http://127.0.0.1:8787
```

This used to fail on the build machine with `X [ERROR] write EOF` before the first request. The
cause was entirely outside the project: the bundled `workerd.exe` imports Windows UCRT libraries,
and that machine was missing `api-ms-win-crt-*` forwarders from `System32` plus `VCRUNTIME140_1.dll`.
Running `workerd.exe` directly returned `STATUS_DLL_NOT_FOUND` (0xC0000135). A space-free project
path, a `PATH` entry pointing at `C:\Windows\System32\Downlevel`, and copying the DLLs beside the
binary were all tested and did **not** help. Installing the official Microsoft Visual C++ 2015–2022
Redistributable (x64) fixed it, and `wrangler dev` plus `wrangler d1` now work.

If `write EOF` ever comes back on another machine, that is the sequence to check first: run
`workerd.exe --version` and look for a loader error rather than changing project code.

`dev:api` is a fallback that runs the **same Worker handler and the same migrations** on Node,
against a file-backed SQLite database through a small D1-compatible shim. Keep it for environments
where `workerd` cannot run:

- It does **not** prove Workers/workerd compatibility.
- Prefer `dev:cf` for anything that touches runtime behavior; use `dev:api` only when wrangler is
  genuinely unavailable.
- On this machine `dev:api` and `dev:cf` keep separate databases (`.wrangler/dev/kromafi.db` versus
  `.wrangler/state/v3/d1`), so switching between them looks like a fresh install.

## Checks

```bash
npm test        # Worker API + offline logic (67 tests)
npm run typecheck
npm run build   # production PWA build into dist/
```

The tests exercise the real Worker request handler against the real migration SQL, and the real
encryption/IndexedDB code against a fake IndexedDB implementation.

## Deployment checklist

The approved target is Cloudflare Free, which needs no card. This sequence has been run end to end
against the client's trial account; the deployment lives at
**https://kromafi-apotek.kromafi.workers.dev** with D1 `kromafi-apotek`
(`db477559-d51d-40f3-a822-d1cb2c21904e`, region APAC) behind it.

Each new pharmacy repeats the same steps on **its own** Cloudflare account, so every customer owns
their Worker, their database, and their data.

1. `npx wrangler login` — browser sign-in. No card is requested on the Free plan.
2. `npx wrangler d1 create kromafi-apotek` — copy the returned `database_id` into
   [wrangler.jsonc](wrangler.jsonc), replacing the id of the previous installation.
3. `npx wrangler d1 migrations apply DB --remote` — creates the schema in the real database.
4. Create the first real admin: `npm run staff:bootstrap` (add `--remote` when the database is
   deployed). **Do not run `worker/seed/dev.sql` in production** — it contains demo passwords
   published in this repository.
5. `npm run build && npx wrangler deploy` — uploads the Worker and the built assets.
6. Smoke-test the deployed origin: `/api/health`, sign-in, and a `401` for `/api/items` without a
   session.
7. Confirm the PWA loads over HTTPS and the service worker registers.

### First admin (`npm run staff:bootstrap`)

Creates exactly one admin in an empty database, from a password typed at the terminal. The password
is hashed with the same PBKDF2-SHA-256 settings as the Worker, is never written to a file or log,
and is never echoed back.

```bash
npm run staff:bootstrap                                  # local database
npm run staff:bootstrap -- --remote                      # deployed database
npm run staff:bootstrap -- --persist-to .wrangler/other  # a specific local persistence dir
```

The script resolves the project and wrangler from its own location, so it works from any working
directory. On Windows, if PowerShell refuses `npm` with `running scripts is disabled on this
system`, call Node directly instead of changing the machine's execution policy:

```powershell
node "D:\path\to\app\scripts\bootstrap-admin.mjs" --remote
```

`--reset` replaces the password of an existing account and ends its sessions; use it when an admin
loses their password, or when a stored credential was written with settings the runtime no longer
accepts. It asks for the username, then the new password:

```bash
node "D:/path/to/app/scripts/bootstrap-admin.mjs" --remote --reset --username budi
```

The script refuses to run when an admin already exists (use `--force` only if you really mean it),
rejects a username or password that would break the SQL, and tells you to run the migrations when the
`staff` table is missing. `--username`, `--name`, and `--password-stdin` exist for automation.

Verified on a database migrated from scratch: the account it created signed in with the typed
password, a wrong password returned `401`, and a second run was refused with
`Sudah ada 1 admin di database lokal`.

The bundle is validated without an account:
`npx wrangler deploy --dry-run --outdir=.deploy-check` reads the 7 files in `dist/` and lists both the
`env.DB` and `env.ASSETS` bindings. The last real deploy reported `Total Upload: 42.32 KiB / gzip:
9.36 KiB`.

## Backup and restore

A full local drill has been run: export, restore into an empty database, compare row counts, then
serve from the restored copy.

```bash
# 1. Export the local database to a portable SQL dump
npx wrangler d1 export DB --local --output=./backups/local-backup.sql

# 2. Restore into an empty persistence directory (never over the live one)
npx wrangler d1 execute DB --local --file=./backups/local-backup.sql --persist-to=.wrangler/restore-test

# 3. Compare counts against the source database
npx wrangler d1 execute DB --local --persist-to=.wrangler/restore-test --command "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM staff) AS staff"
```

Result: `items 1, staff 2, sessions 2, login_attempts 0, audit_events 1, sync_operations 1,
d1_migrations 1` in both the source and the restored database, and `wrangler dev
--persist-to=.wrangler/restore-test` accepted a sign-in and returned the same Barang record — so the
restore is not just rows in a file, it serves requests.

For the hosted database the same command runs with `--remote` instead of `--local` (needs P1).

Two things to keep in mind:

- An export contains the complete schema and data, including PBKDF2 password hashes and staff
  usernames. Treat every backup as a secret: not in the repository, not in chat, not in a shared
  folder.
- D1 rejects a compound `SELECT` with more than five terms (`too many terms in compound SELECT`);
  count several tables with scalar subqueries, as above.

Cloudflare's Time Travel covers the last 7 days on the Free plan; the export is the portable copy.

## Local database and `database_id`

Wrangler keys the local D1 files by the configured `database_id`. Changing that id (for example when
pointing the project at a real deployment) therefore makes the local database look empty. Re-run
`npm run db:migrate:local` and `npm run db:seed:local` after such a change.
The schedule, retention period, and who verifies a restore are still undecided (P2 in PLAN.md).

## Implemented behaviour

**Sessions and access**

- Username + password sign-in, PBKDF2-SHA-256 (**100,000 iterations** — the maximum `workerd`
  accepts; anything higher fails on the deployed runtime with
  `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`), 12-hour
  session cookie (HttpOnly,
  SameSite=Lax, `Secure` on HTTPS).
- Five failed attempts in 15 minutes lock that username for 15 minutes; successful sign-in clears it.
- Role matrix enforced on the server: any active staff may read and write Barang and see the staff
  list; account changes, password resets, and audit history are admin-only. Signed-out requests get
  `401`; mismatched `Origin` on a mutation gets `403`.
- The sidebar brand shows the pharmacy name from the database (`GET /api/pharmacy`), cached on the device so it also appears offline; the hard-coded *Kromafi Apotek* is only the fallback before a profile has loaded (10.2.21). The login title is the fixed *Kromafi Apotek* and never changes with the database (10.2.22).
- Offline sign-in works only for accounts that have signed in online on that device before. The
  device verifies the password against its own PBKDF2 credential; the server hash is never copied.
  That device-side hash uses 210,000 iterations because it runs in the browser, not in `workerd`.

**Sync rules (as approved in [../PLAN.md](../PLAN.md), phases 10 and 12.6)**

- Every queued edit carries a stable `operationId`; retries are answered as `duplicate` and never
  applied twice.
- The latest device-reported time wins when two edits compete; every edit is preserved in audit
  history, and the replaced version is recorded as `superseded`.
- Equal device timestamps (`ambiguous_order`), older edits (`stale_edit`), and device clocks more
  than five minutes ahead of the server (`clock_skew`) are held for review instead of applied.
- An independent operation still applies when another in the batch fails.
- Every queued operation carries the `authorId` of the account that recorded it, so the server judges
  the account that did the work rather than the account that happens to send the queue later.
- Account status is re-checked for each operation while it is processed, against the deactivation time
  stored on the server. Work recorded **before** that time is applied and its audit note says
  `operation_before_deactivation`; work recorded **after** it returns `cancelled`
  (`account_deactivated`) and is never applied — even when an active account sends it. When the sender
  is not the author, the note adds `pushed_by:<staffId>`, and the audit row belongs to the author.
- Reactivating an account clears its deactivation time, so a later deactivation records a fresh one.
- Deactivating an account also closes any ledger row the server had already claimed for it, so nothing
  of that account stays in flight.
- Held work stays in the outbox, is shown on the Barang screen with a plain-language reason, and can
  be corrected and re-sent or discarded. Work the centre cancels (10.2.13) is removed from the device
  silently: it is never re-sent, never listed in the outbox, and raises no notice, because the server
  decides it in the background.

**Password recovery (no email service)**

- An admin issues eight one-time codes per staff member from the Petugas screen; the first admin
  receives theirs when `npm run staff:bootstrap` runs. Codes look like `A1B2-C3D4-E5F6` and are shown
  exactly once.
- Only a salted SHA-256 hash is stored. Codes carry about 60 bits of entropy, so a fast hash is
  safe here and keeps password checking inside the Workers CPU budget.
- The route `POST /api/recovery/reset` accepts a username, one code, and a new password. It still
  works, but the login screen no longer links to it (10.2.18); an admin resets a password from the
  Petugas detail instead. A code works once, ends that account's sessions, and is refused for a
  deactivated account.
- Wrong codes count toward the same five-attempts-in-15-minutes lockout as a wrong password, and an
  unknown username answers exactly like a wrong code so the screen cannot be used to discover accounts.
- This works with no internet service provider, no domain, and no third-party account — which is why
  it was chosen over an email vendor for a pharmacy that may be offline.

**Staff administration (admin only)**

- Create, edit, activate/deactivate accounts, and reset a password from the Petugas screen. **Reset
  password** is offered only while the account is **Aktif**, and the server refuses it otherwise.
- Creating an account asks for an **initial password** of at least 8 characters: the admin types it,
  hands it to the staff member, and the staff member can change it from their own account detail.
  The PIN, its sign-in route, and its screen were removed (10.2.20), and `0009_drop_pin.sql`
  dropped the columns they used.
- The Petugas screen shows a staff member only their own account; an admin sees every account.
- A name and username are fixed once the account exists; only role and status can change afterwards.
- A forgotten password is recovered through an admin password reset, and a staff member can change
  their own password from their account detail.
- Deactivating an account or resetting its password ends its sessions immediately; a deactivated
  account is refused at sign-in with a clear message.
- A reset sets a temporary password the admin hands over; the staff member changes it from their own
  account detail after signing in. The screen never shows the old password, and the audit row records
  the acting admin, the target, and the action without any password data.
- An admin cannot change their own role or deactivate themselves, and the last active admin cannot be
  removed, so the pharmacy cannot lock itself out.
- Every account change is written to the audit log with the acting admin and before/after values, but
  never with password data.

**Offline and device setup**

- A device that has loaded the app can reopen it without internet (service worker shell cache).
- New devices choose between **Sync from Cloudflare** and **Import file from another device**;
  import is blocked while the device holds unsent work.
- Export produces a versioned, AES-GCM-encrypted `.kromafi` file containing only server-confirmed
  Barang data and its sync cursor — never credentials, sessions, or pending operations.

## Known gaps

- Deployed to the trial Worker URL above with its first admin (`admin`) created by
  `npm run staff:bootstrap -- --remote --username admin`, which also issued that account's one-time
  recovery codes. The custom domain and the second admin are still open (P1).
- The first admin comes from `npm run staff:bootstrap -- --remote --username admin`, not from the
  Petugas screen. Every later account is created normally from the Petugas screen.
- Only the Barang screen is implemented; the other 17 prototype menus are listed but disabled.
- Password recovery does not use email (P5 was resolved in favour of one-time recovery codes). A
  staff member who has no codes left needs an admin to reset the password from the Petugas screen.
- If the only admin loses the password and has no codes left, the break-glass path is
  `node scripts/bootstrap-admin.mjs --remote --reset --username <admin>` from a terminal with access
  to the Cloudflare account; it replaces the password and ends that account's sessions (10.2.15).
- Staff accounts created before this feature (the local seed) still come from
  [worker/seed/dev.sql](worker/seed/dev.sql); production accounts are created through the app.
- Only one staff account is provisioned per device at a time; switching accounts offline works by
  signing in with username + password for an account that has signed in online there before.
