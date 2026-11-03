# Product Requirements Document (PRD)

## 1. Product objective

Kromafi Apotek needs an offline-capable web application for one pharmacy, used by multiple staff on multiple devices. Cloudflare Pages, Workers, and D1 provide the shared online application and authoritative database. Devices that have already loaded the app must be able to record all approved workflows while offline, then synchronize their local pending operations when connectivity returns.

The product must be built as a real application, not as a prototype-only workflow. The client-approved UI in `UI/` is the design and workflow baseline. The production application lives in `app/`: it is deployed as a trial on Cloudflare and currently implements eight of the 18 menus — Barang, Jasa, Petugas, Lemari, Metode pembayaran, Dokter, Distributor, and Profil apotek — on one offline-sync engine (access control, staff administration, items, offline sync, encrypted export/import). The remaining 10 menus are still requirements, not implemented behaviour.

## 2. Users

### Primary users

- Admin: manages staff, settings, roles, stock review, and operational oversight.
- Staff: processes sales, records goods receipts, performs stock checks, and views relevant reports.

### Supporting roles

- Pharmacy owner or supervisor: reviews business performance and operational exceptions.
- Support or technician: maintains the Cloudflare deployment and helps recover devices with pending offline work.

## 3. Product goals

- Replace manual or spreadsheet-based pharmacy operations with a consistent digital workflow.
- Keep the first production release focused on one pharmacy, with multiple devices sharing one Cloudflare-hosted application and D1 database.
- Make the application reliable enough for operational use without depending on prototype-only browser storage.
- Allow every approved workflow to be recorded offline after the device has loaded the app and required data.
- Make the difference between device-local pending work and server-confirmed records unmistakable.
- Give the team a clear and trusted view of stock, sales, supplier activity, and expiry status.
- Enforce role-based access so only authorized users can perform sensitive operations.

## 4. Core use cases

### 4.1 Staff login and access control

- Staff can sign in with their own account, using a username and one password form; the login screen shows the pharmacy name from the database (10.2.18).
- Failed attempts are limited and tracked to reduce abuse.
- Inactive or unauthorized accounts cannot access protected functions.
- Admin and staff roles are enforced by the server, not only by browser behavior.

### 4.2 Product and reference data management

- Manage item master data, including unit, cabinet, supplier relations, and stock status.
- Maintain supplier list, doctor list, payment method list, and service list.
- Maintain pharmacy profile and operational settings.

### 4.3 Cashier sales

- Search for items by name or stock identifier.
- Select quantity, calculate totals, and apply agreed discounts.
- Accept payment and generate a receipt.
- Prevent or flag invalid transactions, missing quantities, or unauthorized sales actions.

### 4.4 Goods receipt and supplier invoice

- Record supplier invoices or purchase receipts.
- Link incoming products and quantities to supplier data.
- Store batch and expiry details where relevant.
- Maintain a correct record of stock increases and invoice totals.

### 4.5 Stock adjustment and stock opname

- Record stock corrections with clear reason and staff attribution.
- Support stock opname workflow for count reconciliation.
- Make stock variance visible and auditable.

### 4.6 Expired or damaged goods

- Record expired, damaged, or returned goods.
- Assign the responsible action or disposition.
- Keep the event traceable for operational review.

### 4.7 Reports and operational overview

- View sales, stock, expired goods, and supplier activity summaries.
- Review daily close information and operational anomalies.
- Use data that is stored in the database and not only in browser memory.

### 4.8 Backup and restore

- Create backups/exports of the Cloudflare D1 database.
- Restore from backup when necessary.
- Verify the restore process before release.

### 4.9 Offline work and synchronization

- The PWA must reopen on a device that has previously loaded it, even when internet access is unavailable.
- All approved workflows, including master-data changes and stock/financial operations, can be entered into that device's local pending queue.
- Pending work is stored locally across reloads and clearly identified as not yet confirmed by the server.
- Multiple devices share confirmed data through D1 while online; offline changes remain isolated to the device that created them.
- Offline reads and reports use the last local snapshot, display its last sync time, and clearly distinguish local pending changes from server-confirmed data.
- When connectivity returns, the app synchronizes pending operations with safe retries, server-side permission/business-rule validation, and duplicate protection.
- Queued operations are synchronized in dependency order so that offline-created reference records are available before dependent documents.
- Pending documents use stable provisional device-generated IDs; official numbering and the receipt treatment for an offline sale must be decided before release.
- Conflicting or rejected operations remain visible and recoverable for review; the app must not silently overwrite or discard them.
- The app displays connection state, last successful sync, pending work, and unresolved conflicts.
- Pending work remains on its originating device until confirmed; device loss or browser-data deletion may make unsynchronized work unrecoverable, so the app must warn users and the recovery policy must be agreed.

## 5. Functional requirements

### 5.1 Authentication and authorization

- The application must support staff login and logout.
- Passwords must be hashed and stored securely.
- The API must enforce role-based permissions for admin and staff actions.
- The server must reject unauthorized access to mutating endpoints.

### 5.2 Product master

- Products must have a unique identifier and basic description.
- Products must support unit, cabinet, and stock information.
- Product records require validation for required fields and safe values.

### 5.3 Sales

- Sales must generate an order or invoice record with line items.
- Sales totals must be calculated consistently.
- Sales must update stock correctly and traceably.
- Payment and change must be handled according to the agreed rules.

### 5.4 Purchase and invoice workflow

- Goods received must be recorded with supplier and invoice data.
- Purchase lines must connect to item data and quantity values.
- Invoice totals must be validated before saving.

### 5.5 Stock and inventory operations

- Stock movement must be captured centrally and consistently.
- Variance and differences must be visible in stock adjustment and opname review.
- Stock-level checks must prevent silent data drift.

### 5.6 Expiry and waste handling

- Expired or damaged goods must be recorded as events with actions and reason.
- The system must support review of expired products by time and quantity.

### 5.7 Reporting

- Sales reports, stock reports, and expired-goods reports are required for the first usable version.
- Reports must be based on the persisted database and not on prototype localStorage data.

### 5.8 Backup and recovery

- The system must support a restorable D1 backup/export process with a verified restore.
- Backup creation and restore validation must be part of release readiness.

## 6. Non-functional requirements

- The app is hosted on Cloudflare Pages and accessed by multiple devices; core operation must not require internet after a device has completed initial app/data loading.
- The backend must validate all critical inputs on the server.
- D1 must keep confirmed business data persistent and shared across devices.
- IndexedDB must retain a device's cached data and pending operations across reloads; unsynchronized data must not be presented as confirmed shared state.
- Every queued mutation must have a stable idempotency key and enough attribution/version metadata to support safe retry and conflict detection.
- Offline use requires a locally available staff identity/session; its lifetime and behavior after account revocation must be defined before release.
- The server must revalidate current permissions and business rules at synchronization time; offline devices cannot receive account revocation or permission changes until reconnecting.
- The system must be stable enough for routine use in a pharmacy environment.
- The application should not depend on runtime CDN assets for core functionality.
- The UI should remain usable on common desktop and tablet viewports.

## 7. Out of scope for version 1.0

- Multi-branch or multi-site orchestration
- Advanced accounting or tax automation
- Supplier ordering automation with external systems
- Mobile app store deployment

## 8. Acceptance criteria

The first usable version is accepted when all of the following are true:

1. Staff can log in with valid accounts and role permissions are enforced by the server.
2. Confirmed sales, stock changes, invoices, and inventory data are stored in D1 and shared across online devices.
3. The core pharmacy workflows can be completed end-to-end without prototype-only data.
4. Reports match the real stored data and reflect actual stock and transaction records.
5. After initial loading, a device can perform every approved workflow offline; pending records survive reloads and are not shown as server-confirmed.
6. When connectivity returns, operations synchronize without duplicates; stale or conflicting operations are retained and surfaced for resolution.
7. Multi-device tests show that offline changes are isolated until sync and that server-side validation prevents silent overwrites.
8. D1 backup and restore has been tested successfully at least once.
9. The client accepts the live or near-live validation session as ready for day-to-day use.

## 9. Product decisions still pending

- Expected peak concurrent staff/devices and transaction volume for sizing
- Printer model and receipt layout
- D1 backup retention and recovery objectives
- Offline login/device access policy, including disconnected account revocation
- Who reviews and resolves rejected/conflicting offline operations
- Recovery policy for pending work if a device is lost or browser data is cleared
- Offline sales receipt policy and when official sale numbering is assigned
- Recovery for a single-admin installation that has lost its recovery codes; the recovery-code route, the admin password reset, and the break-glass script exist (10.2.5, 10.2.14, 10.2.15), and no email service is planned
- Whether daily closing and cash reconciliation are required in version 1.0 and what they must show

## 10. Notes

This PRD is deliberately scoped to the first production-ready release. It is not a long-term feature wish list. The product should ship only once the core workflows above are proven and accepted in actual use.
