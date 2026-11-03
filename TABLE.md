# Data Tables and Storage Inventory

## Current application status

The Barang first slice exists in `app/`: a React/Vite PWA, a Cloudflare Worker API, D1 migrations,
and per-device IndexedDB storage. Verified by automated tests against the Worker handler and by a
local browser run. The application has **not** been deployed to Cloudflare, so no remote D1 database
is provisioned yet (tracked as P1 in [PLAN.md](PLAN.md)).

## Implemented application storage — Cloudflare D1 and per-device IndexedDB

| Store | Purpose | Current schema | Source of truth |
|---|---|---|---|
| Cloudflare D1 (`DB`) | Shared database for confirmed records | `staff`, `sessions`, `login_attempts`, `items`, `audit_events`, `sync_operations` in [0001_init.sql](app/worker/migrations/0001_init.sql) | Authoritative source of truth |
| Browser IndexedDB `kromafi-apotek` | Per-device confirmed-item cache, durable outbox, session, and offline credentials | Object stores `meta`, `items`, `outbox`, `credentials` in [idb.ts](app/src/lib/idb.ts) | Device-local provisional data only; not shared or authoritative until Worker confirmation |
| PWA service-worker cache | App shell and static assets so a device can reopen the app offline | Caches `kromafi-shell-v1`, `kromafi-assets-v1` in [sw.js](app/public/sw.js) | Application assets only; never business records |

### Cloudflare D1 tables

**`staff`** — who may sign in and what they may do.

- Fields: `id` (text, primary key), `name`, `username` (unique, case-insensitive, 3-32 lowercase characters), `role` (`admin`/`staf`), `status` (`Aktif`/`Tidak aktif`), `password_hash`, `password_salt`, `password_iterations`, `deactivated_at`, `created_at`, `updated_at`.
- Keys: primary key `id`; unique index on `username`.
- Access and lifecycle: written by admin-only staff administration in the Petugas screen; read by the login handler and every authenticated request. Passwords are PBKDF2-SHA-256 hashes; plain passwords are never stored, and a reset ends that account's sessions.
- Source of truth: [0001_init.sql](app/worker/migrations/0001_init.sql).

**`sessions`** — signed-in browser sessions.

- Fields: `token_hash` (primary key), `staff_id`, `created_at`, `expires_at`.
- Keys: primary key `token_hash`; index `idx_sessions_staff`.
- Access and lifecycle: the raw session token exists only in the browser's HttpOnly cookie; D1 stores its SHA-256 hash. Sessions expire after 12 hours and are deleted on logout or expiry.
- Source of truth: [0001_init.sql](app/worker/migrations/0001_init.sql).

**`login_attempts`** — failed sign-in counting per username.

- Fields: `username` (primary key, case-insensitive), `attempt_count`, `first_attempt_at`, `locked_until`.
- Access and lifecycle: written by the login handler and by the recovery-code handler (a wrong code counts as a failed attempt); five failures within 15 minutes lock the username for 15 minutes; a successful sign-in or recovery clears the row.
- Source of truth: [0001_init.sql](app/worker/migrations/0001_init.sql).

**`recovery_codes`** — one-time password-recovery codes, the approved alternative to email reset.

- Fields: `id` (primary key), `staff_id` (references `staff.id`, `ON DELETE CASCADE`), `code_hash`, `code_salt`, `used_at`, `created_at`.
- Keys: primary key `id`; index `idx_recovery_codes_staff`.
- Access and lifecycle: written when an admin issues codes (or when the bootstrap script creates the first admin); the plaintext exists only in the response/terminal that printed it. Each code is stored as a salted SHA-256 hash of a 12-character Crockford-base32 value (about 60 bits), can be used once, and reissuing deletes every unused code for that account. Successful use sets `used_at`, replaces the password hash, deletes that account's sessions, and writes an `audit_events` row with action `staff.recovery_used`.
- Source of truth: [0002_recovery_codes.sql](app/worker/migrations/0002_recovery_codes.sql), [recovery.ts](app/worker/src/recovery.ts).

**`items`** — Barang master for the first slice.

- Fields: `id` (primary key), `nama` (unique, case-insensitive), `satuan`, `harga_modal` (integer rupiah), `harga_jual` (integer rupiah), `stok` (real; negative allowed by business rule), `lemari`, `status` (`Aktif`/`Tidak aktif`), `version`, `device_updated_at` (winning device-reported time), `server_updated_at`, `created_at`, `updated_by`.
- Keys: primary key `id`; unique index `idx_items_nama_unique`; index `idx_items_server_updated`.
- Access and lifecycle: read through `/api/items` and `/api/sync/snapshot`; written only by the sync engine after validation. Records are deactivated, not deleted.
- Source of truth: [0001_init.sql](app/worker/migrations/0001_init.sql), [sync.ts](app/worker/src/sync.ts).

**`audit_events`** — every accepted, superseded, conflicting, or rejected item edit, plus staff account changes.

- Fields: `id`, `entity`, `entity_id`, `action`, `outcome` (`applied`/`superseded`/`conflict`/`rejected`), `staff_id`, `device_id`, `operation_id`, `device_time`, `server_time`, `base_version`, `resulting_version`, `before_json`, `after_json`, `note`.
- Keys: primary key `id`; index `idx_audit_entity`.
- Access and lifecycle: append-only. Item rows use `entity = 'item'`; account changes use `entity = 'staff'` with actions `create`, `update`, `password_reset`, `staff.recovery_codes`, and `staff.recovery_used`, and never store password data. Read by admins through `/api/audit`; retained for history and conflict review.
- Source of truth: [0001_init.sql](app/worker/migrations/0001_init.sql).

**`sync_operations`** — idempotency ledger for queued device operations.

- Fields: `operation_id` (primary key), `staff_id`, `device_id`, `author_id`, `entity`, `entity_id`, `action`, `device_time`, `server_time`, `status`, `message`, `response_json`.
- `author_id` is the account that recorded the work on the device; `staff_id` is the same account, and the status of that account decides the outcome when the row is processed (10.2.12).
- `status`: `processing` while claimed, then `applied`, `duplicate`, `conflict`, `rejected`, or `cancelled` for work recorded by an already-deactivated account.
- Keys: primary key `operation_id`; index `idx_sync_operations_author` on `author_id`, used to close a deactivated account's in-flight rows.
- Access and lifecycle: a row is claimed before processing and completed with the stored response, so a retried operation is answered as `duplicate` instead of being applied twice. Rows are retained as the record of what each device sent.
- Source of truth: [sync.ts](app/worker/src/sync.ts) and [0005_operation_author.sql](app/worker/migrations/0005_operation_author.sql).

### Device storage (IndexedDB `kromafi-apotek`, version 1)

- **`meta`** — key/value: `deviceId`, current `session`, `lastSyncAt`, `cursor`, `offlineUsername`. Access: local only; cleared only by explicit device reset.
- **`items`** — last server-confirmed item snapshot, keyed by `id`. Never holds pending edits.
- **`outbox`** — queued operations keyed by `operationId`, index `itemId`. Fields: `action`, `itemId`, `authorId` (account that recorded the change), `baseVersion`, `deviceTime`, `payload`, `queuedAt`, `status` (`pending`/`held`/`cancelled`), `message`. Survives reloads; a held operation stays visible until it is corrected and re-sent or discarded, and a cancelled operation stays visible as **Dibatalkan** but is never sent again.
- **`credentials`** — one local credential per staff username: `username`, `staffId`, `name`, `role`, `hash`, `salt`, `iterations`, `provisionedAt`. Derived on the device from the password at online sign-in; the server hash is never copied to the device.

Business records written by the first slice are limited to `items` and `audit_events`; sales, invoices,
stock movements, batches, and reports are still planned.

## Prototype inventory — browser localStorage (approved baseline)

The following keys belong to the client-approved UI prototype in `UI/`. Since the production
application has not been built, no production app reads or writes these keys. Prototype credentials
or records are not production data; this storage documents the approved interaction model only.

| Key | Purpose | Main fields | Written by |
|---|---|---|---|
| `kromafi.petugas` | Staff accounts used for login and roles | `id`, `nama`, `email`, `passwordScheme`, `passwordIterations`, `passwordSalt`, `passwordHash`, `role` (`admin`/`staf`), `status` | `js/core/store.js`, `js/pages/petugas.js` |
| `kromafi.loggedInUser` | Email of the signed-in staff member | string | `js/app.js` |
| `kromafi.loginAttempts` | Failed-login counts and temporary lockout timestamps per account email | email key → `count`, `firstAttemptAt`, `lockedUntil` (epoch milliseconds) | `js/core/store.js` |
| `kromafi.barang` | Item master with one stock number per item | `id`, `nama`, `satuan`, `stok`, `hargaModal`, `hargaJual`, `lemari`, `status`, `bulan_stok_opname` | `js/pages/barang.js`, `stok-opname.js`, `kartu-stok.js` |
| `kromafi.penjualan` | Cashier sales documents | `id`, `tanggal`, `waktu`, `items[]`, `total_tagihan`, `total_tagihan_final`, `metodePembayaran`, `bayar`, `namaPasien`, `namaDokter`, `namaPetugas`, `locked` | `js/pages/penjualan.js` |
| `kromafi.fakturOrderan` | Supplier invoices (goods received) | `id`, `distributorId`, `distributorNama`, `nomorFaktur`, `tanggalFaktur`, `jatuhTempo`, `statusPelunasan`, `items[]`, `totalTagihan`, `locked` | `js/pages/faktur-orderan.js` |
| `kromafi.stokOpname` | Stocktake adjustments | `id`, `productId`, `stokSistem`, `stokFisik`, `selisih`, `bulan_stok_opname`, `tanggal`, `petugasNama` | `js/pages/stok-opname.js` |
| `kromafi.expiredMutasi` | Expired destruction and returns | `id`, `productId`, `jumlah`, `tindakan`, `batch`, `nomorFaktur`, `tanggal`, `distributorNama`, `petugasNama` | `js/pages/expired.js` |
| `kromafi.distributors` | Supplier list | `id`, `nama`, `status` | `js/pages/distributor.js` |
| `kromafi.dokter` | Doctor list | `id`, `nama`, `status` | `js/pages/dokter.js` |
| `kromafi.jasa` | Service list | `id`, `nama`, `harga`, `status` | `js/pages/jasa.js` |
| `kromafi.lemari` | Cabinet list | `id`, `nama`, `status` | `js/pages/lemari.js` |
| `kromafi.metode-pembayaran` | Payment method list | `id`, `nama`, `status` | `js/pages/metode-pembayaran.js` |
| `kromafi.pharmacy` | Pharmacy profile | `name`, `address` | `js/pages/profil-apotek.js` |
| `kromafi.laporanDraft` | Report draft input | report filter fields | `js/pages/laporan.js` |
| `kromafi.syncQueue` | Outbox of documents waiting to be sent | `id`, `type`, `refId`, `label`, `waktu` | `js/core/store.js` |

Key relationships: sales, invoices, stocktakes, and expired transactions reference items by
`productId`; invoices reference suppliers by `distributorId`. Reference lists are copied by value
(for example `distributorNama`), so renaming a supplier does not rewrite old documents.

Access and lifecycle: every prototype key is readable and writable by any script on the page. Nothing expires,
nothing is versioned, and deletion is permanent. Clearing site data removes all of it.

Source of truth: the approved prototype files under `UI/src/js/`; the runtime output is `UI/index.html`.

## Planned D1 tables for later domains (not implemented)

Not yet implemented. Their design is subject to the approved domain rules, offline synchronization
requirements, and migrations in `PLAN.md`.

- `batches` — batch code and expiry date per invoice line.
- `sales`, `sale_lines` — cashier documents and their lines.
- `invoices`, `invoice_lines` — supplier invoices with batch and expiry.
- `stock_movements` — one row per movement, the single source for stock history.
- `settings` — pharmacy profile and numbering.

## Table documentation format

For each table or object store added to the application, document:

- **Name and location:** The exact table/store name and its database or storage location.
- **Purpose:** What information it stores and which application feature uses it.
- **Fields:** Field names, data types, required/optional status, defaults, and constraints.
- **Keys and relationships:** Primary keys, indexes, foreign keys, and references to other tables/stores.
- **Access and lifecycle:** Which clients or services read/write it, retention/deletion behavior, and relevant access controls.
- **Source of truth:** The schema, migration, or code location that defines it.

Document indexes, views, collections, and other persisted structures as well as conventional tables when they are part of the application data model.
