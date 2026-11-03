# System Design

## 1. Design objective

The Kromafi Apotek system is planned as a maintainable offline-capable web application for one pharmacy, using Cloudflare Pages, Workers, and D1. D1 is the shared source of truth when connected; each device uses a local cache and pending-operation queue while offline.

The UI prototype in `UI/` is the client-approved baseline for design direction and workflow validation. The production application lives in `app/` and is deployed as a trial on Cloudflare; eight menus are implemented (Barang, Jasa, Petugas, Lemari, Metode pembayaran, Dokter, Distributor, and Profil apotek) on one offline engine: staff sign-in, staff administration, items, the offline outbox, synchronization, and export/import.

This document describes the target design for the whole application. Where it describes sales, purchasing, stock, expiry, or reporting, that is planned design, not verified implementation; the implemented parts are marked as such in [PLAN.md](PLAN.md) phase 3 and phase 11.

## 2. Design principles

- Keep the first release simple and operationally realistic.
- Separate UI, business logic, and persistence clearly.
- Enforce critical rules on the server, not only in the browser.
- Make financial and stock operations auditable and traceable.
- Support multiple staff and devices through one shared cloud service.
- Keep offline work device-local and visibly provisional until the server confirms it.

## 3. Planned high-level architecture

```
Browser / React PWA on Cloudflare Pages
   ├─ cached application shell
   ├─ IndexedDB: local cache and pending-operation outbox
   │
   │ HTTP JSON / queued-operation sync
   ▼
Cloudflare Worker API
   │
   ▼
Cloudflare D1 (authoritative shared database)
```

### Components

- Frontend: planned React/Vite PWA in `app/`, hosted by Cloudflare Pages
- API: planned Cloudflare Worker exposing authenticated business and synchronization endpoints
- Database: planned Cloudflare D1 database shared by all online devices
- Offline storage: planned IndexedDB for cached data and an outbox on each device; it is not the authoritative shared database
- App shell: service-worker caching so a device that has previously loaded the app can reopen it without internet

### Offline and synchronization behavior

- All approved workflows may be entered offline on a device with the app and required data already cached.
- Offline use requires a locally available staff identity/session; its lifetime and behavior after account revocation are deployment policies that must be decided.
- Every offline change is stored locally with a stable operation ID, device/user attribution, timestamp, and the relevant base record version.
- Local changes are visibly **pending** until the Worker validates and commits them to D1. A local save is not a server-confirmed transaction.
- Devices disconnected from the internet do not share new changes with one another. Each device may have stale data and must show its last successful synchronization time.
- Offline reads and reports use the last local snapshot and must be labeled with its sync time; device-local pending changes must remain visibly provisional.
- On reconnection, the client sends queued operations safely with retries. The Worker rechecks current authentication, permissions, and domain rules, deduplicates retries, and returns canonical server results.
- Queued operations are synchronized in dependency order so that offline-created reference records exist before documents that use them.
- Pending documents use stable device-generated UUIDs, no numbering is generated, and an unsynced nota is printed with no marker, so the receipt is identical online and offline (10.2.25, 10.2.26).
- Operations that are stale, invalid, unauthorized, or conflicting are retained and shown as actionable failures; they are never silently discarded or overwritten. Resolution is domain-specific and preserves an audit trail. The one exception is work the server refuses for good because the account that recorded it was deactivated (10.2.13): the device removes it without notice, and the server ledger is the only remaining record.
- Server-confirmed operations update the local cache. Pending operations must survive app reloads; the UI warns before any action that could erase unsynchronized data.
- Device loss or browser storage deletion can destroy work that has not reached D1; the app must warn clearly and the operational recovery policy must be agreed before release.
- Offline mode requires a prior successful app load and local data bootstrap. It cannot provide immediate account revocation, shared real-time data, or server confirmation while disconnected.

## 4. Frontend design

The frontend is responsible for:

- authentication and session handling
- navigation between operational screens
- creating and editing master data
- cashier workflow for sales
- goods receipt workflow
- stock opname and stock adjustment workflow
- report review and daily operational summary

### Design expectations

- Use the approved prototype as the UX baseline.
- Build the product interface in `app/` instead of reusing `UI/` source files directly.
- Treat visual flow decisions as product requirements, but do not depend on prototype localStorage as the production data source.
- Do not show a locally queued financial or stock operation as finalized until the Worker confirms its D1 commit.
- Surface online/offline state, stale-data time, pending queue count, and per-operation sync/conflict status; identify offline reports as local snapshots.

## 5. Backend design

The backend is responsible for:

- authenticating users
- authorizing actions by role
- validating input data
- applying business rules to stock, pricing, and totals
- writing to the database
- exposing report queries and operational endpoints
- validating and applying device outbox operations idempotently
- detecting stale versions and business conflicts during synchronization

### Security rules

- Passwords must be hashed and never stored in plain text.
- Role enforcement must happen on the server.
- Every mutation endpoint must validate permissions.
- Failed login attempts must be tracked server-side.
- Financial and inventory operations should record who made the change and when.

## 6. Planned data model

The initial production database should include the following core entities.

### Staff

- `staff`
- fields: id, name, username, password_hash, role, status, created_at, updated_at

### Items and services

- `items`, implemented in [0001_init.sql](app/worker/migrations/0001_init.sql)
- fields: id, nama, satuan, harga_modal, harga_jual, stok, lemari (cabinet name kept as text), status, version, device_updated_at, server_updated_at, created_at, updated_by
- The client approved one catalogue for goods and services (10.2.16); migration `0007` adds `type` (`barang`/`jasa`) with a `CHECK`. A service stores an empty `satuan`, zero `harga_modal`, zero `stok`, and an empty `lemari`, and the name stays unique across both kinds.

### Reference lists

- `cabinets`, `payment_methods`, `doctors`, `suppliers`, implemented in [0006_reference_data.sql](app/worker/migrations/0006_reference_data.sql)
- fields: id, nama (unique, case-insensitive), status, version, device_updated_at, server_updated_at, created_at, updated_by
- Separate tables on purpose (10.2.17): a foreign key must never be able to point at the wrong kind of record, and each list will grow its own fields. They share one column pattern and one generic screen in the app. The Tunai payment method is seeded by migration `0008` with a fixed id and is locked active in both the Worker and the screen (10.2.19). The pharmacy profile is edited by admins only; staff see the same fields read-only without a warning (10.2.18).

### Batches and expiry

- `batches`
- fields: id, item_id, batch_code, expiry_date, quantity, supplier_id, created_at

### Suppliers

- `suppliers`, implemented in [0006_reference_data.sql](app/worker/migrations/0006_reference_data.sql)
- fields: id, nama, status, version, device_updated_at, server_updated_at, created_at, updated_by
- Invoices will copy the supplier name by value, so renaming a distributor never rewrites an old document.

### Doctors and service records

- `doctors`, implemented in [0006_reference_data.sql](app/worker/migrations/0006_reference_data.sql): id, nama, status, version, device_updated_at, server_updated_at, created_at, updated_by
- services are rows in `items` with `type = 'jasa'` (10.2.16), not a separate table

### Sales and sales lines

- `sales` and `sale_lines` — cashier documents and their lines.
The column-level plan, including the stored final selling price per unit (10.2.24), lives in [TABLE.md](TABLE.md); it is a plan, not an implemented schema.

### Purchase invoice and invoice lines

- `purchase_invoices`
- `purchase_invoice_lines`
- capture supplier invoices and their quantities

### Stock movements

- `stock_movements`
- one row per stock change event; this is the primary audit trail for stock history

### Settings

- `settings`, implemented in [0006_reference_data.sql](app/worker/migrations/0006_reference_data.sql)
- one row with a fixed id (`apotek`), fields nama_apotek, alamat plus the shared sync columns; only an admin may write it
- no receipt numbering is generated (10.2.25); operational defaults will be added here when sales are built

## 7. Target workflow design

### 7.1 Login

1. User submits credentials.
2. API validates username and password.
3. API checks account status and role.
4. API returns session token or auth result.
5. Frontend stores the auth state and routes to authorized screens.
6. The screen shows one password form only (10.2.18): the temporary-PIN entry, the *Lupa password?* link, and the PIN-to-password screen are removed. Its title is the pharmacy name from `GET /api/pharmacy`, cached on the device for offline sign-in. New accounts take an initial password the admin types and hands over (10.2.20).

### 7.2 Sales workflow

1. User selects a product.
2. System validates the quantity and applies the agreed stock rule; negative stock is allowed.
3. System calculates total and applies discount logic.
4. User selects payment method and completes payment.
5. API creates a sales record and stock movement entries.
6. API returns receipt information to the client.

### 7.3 Purchase workflow

1. User records a supplier invoice.
2. API validates invoice data and totals.
3. API creates invoice and stock movement entries.
4. Stock quantity is increased against the appropriate item and batch data.
5. User can review supplier activity and invoice status.

### 7.4 Stock opname workflow

1. User compares actual stock count with system count.
2. User enters adjustments with explanation.
3. API validates anomaly and creates a stock movement entry.
4. System reflects updated stock values and variance.

### 7.5 Expired goods workflow

1. User selects item and quantity.
2. User indicates expired, damaged, or return action.
3. API validates the action, records the event, and updates stock or disposition status.
4. The event remains visible for review and reporting.

## 8. Planned API design

The API should expose clear endpoints grouped by domain.

### Authentication

- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### Master data

- `GET /api/items`
- `POST /api/items`
- `PUT /api/items/:id`
- `GET /api/suppliers`
- `GET /api/doctors`
- `GET /api/services`

### Sales

- `GET /api/sales`
- `POST /api/sales`
- `GET /api/sales/:id`

### Purchase and stock

- `GET /api/purchase-invoices`
- `POST /api/purchase-invoices`
- `GET /api/stock-movements`
- `POST /api/stock-adjustments`
- `POST /api/stock-opname`

### Reports

- `GET /api/reports/stock`
- `GET /api/reports/sales`
- `GET /api/reports/expired`
- `GET /api/reports/supplier-summary`

### Admin and settings

- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/staff`
- `POST /api/staff`

## 9. Validation and data integrity

The system should validate the following at the API boundary:

- required fields
- numeric values and totals
- valid quantities and the agreed negative-stock behavior before sale
- invoice totals and line totals
- negative stock is allowed and must be applied consistently in online and synchronized offline sales
- locked or finalized financial documents
- role permissions before mutation

The Worker and D1 are the final authority for business validation and confirmed records. The browser may perform local validation for usability, but server validation always runs when queued work is synchronized.

## 10. Backup and restore design

- Use Cloudflare D1 backup/export and restore procedures; do not describe the production database as a local SQLite file.
- Define backup schedule, retention, recovery point, and recovery time expectations before release.
- Restore validation should be performed at least once before acceptance.
- Backup and restore should be treated as operational requirements, not optional improvements.

## 11. Prototype-to-product transition

The prototype in `UI/` is the client-approved baseline for interface direction and workflow logic. The production app in `app/` and its database-backed API do not exist yet and must be built to follow that baseline.

This means:

- prototype UI may inform layout and workflow decisions,
- actual product logic must live in the real application,
- localStorage prototype data cannot be treated as production data,
- confirmed business actions must persist through the Worker-backed D1 API;
- offline actions must remain in the device outbox until the Worker confirms them.

## 12. Risks to design

- Prototype assumptions leaking into production logic
- weak server-side validation
- duplicate stock math across screens
- incorrect or missing audit trail
- unsynchronized device data lost through browser storage clearing or device failure
- conflict handling silently overwrites inventory or financial records
- backup and restore strategy not tested before release

## 13. Design status

This document is a working design baseline for the first usable product. It may evolve as client decisions and implementation constraints become clearer, but it should remain aligned with the approved UI prototype and the product requirements in `PRD.md`.
