# Kromafi Apotek — Delivery Plan

This document describes the path from the current project state to a version 1.0 application that is stable enough for real pharmacy use. The client-approved UI prototype and product documentation define the starting baseline; the production application in `app/` implements the approved Barang first slice only.

This plan is a working roadmap, not a substitute for client approval.

## Numbering convention

Every item in this plan is numbered in three levels: **phase** `1`, **subphase** `1.1`, **sub-subphase** `1.1.1`. There are no unnumbered list items.

Every item carries a state: a percentage from the scale below, or a decision state (**Open**, **Answered**, **Approved**, **Blocked**).

Phases 1–9 are the delivery work. Phase 10 holds every question that must be answered, confirmed, or decided, including its own current state and any recorded answer. Phase 11 is the approved first implementation slice. Phases 12–16 hold reference material, risks, out-of-scope items, and the progress summary.

Commitments recorded as `B…` (blocking) and `P…` (phase-gated) are stable ids. Other documents reference them, so an id never changes when an item moves.

## Progress scale

Only **0%, 25%, 50%, 75%, and 100%** are used, at every level.

| Value | Meaning |
|---|---|
| **0%** | Not started. |
| **25%** | Started; initial work or discovery is underway. |
| **50%** | Approximately halfway complete; substantial work remains. |
| **75%** | Nearly complete; remaining work is limited, such as final implementation or validation. |
| **100%** | Complete and checked against the agreed completion criteria. |

---

## 1. Product definition and delivery gates — 25%

Goal: confirm what the first release must do and what is intentionally outside scope. See 12.1 for the verified state that this phase started from.

### 1.1 Approved baseline

- **1.1.1** Finalize the scope for version 1.0 in one pharmacy context. — **100%**
- **1.1.2** Confirm the approved UI prototype as the accepted design baseline. — **100%**
- **1.1.3** Document what is out of scope for the first release. — **100%** (see phase 15)

### 1.2 Remaining definition work

- **1.2.1** Define the minimum usable workflows for the first release. — **25%** (the Barang slice is defined and delivered; eight of the 18 menus are implemented and the remaining 10 are not yet broken into release-size workflows)
- **1.2.2** Define the release exit criteria and acceptance checklist. — **25%** (phase 13 lists the readiness definition; the per-menu acceptance checklist is not written yet)

### 1.3 Exit gate

- **1.3.1** The client agrees on the exact version 1.0 scope and the acceptance checklist. — **50%** (scope approved for the Barang slice; the full release checklist is still open)

---

## 2. Backend feature rules and data model — 25%

Goal: turn the UI-derived feature inventory into backend contracts, business rules, and a persistence model. The approved prototype is the default for visible behavior; this phase is requirements and design work and does not claim that backend code already exists for domains outside `app/`.

### 2.1 Approved UI scope and external dependencies

- **2.1.1** Capture all approved UI screens and visible interactions as the default version 1.0 scope; identify external dependencies such as password recovery and Cloudflare deployment setup. — **100%** (see 12.4)

### 2.2 Access and permissions

- **2.2.1** Define login, session, password recovery, account status, and the prototype-derived admin/staff permission matrix. — **100%** (implemented for the Barang slice; see 3.3 and 3.4)

### 2.3 Sales and pricing rules

- **2.3.1** Define item/service pricing, line and sale discounts, payment/tender rules, change, receipt content, and sale correction/void rules from the approved UI. — **25%** (rules recorded in 12.6; not implemented)

### 2.4 Purchasing rules

- **2.4.1** Define invoice receipt timing, package/unit conversion, cost/tax/discount calculations, batch/expiry metadata, due dates, payments, and supplier returns from the approved UI and client decisions. — **25%** (rules recorded in 12.6; not implemented)

### 2.5 Stock rules

- **2.5.1** Define stock source-of-truth, stock movement categories, negative-stock correction flow, opname rules, expiry/disposal/return effects, and correction rules. — **25%** (item-level stock and movement records exist; the full movement categories are not implemented)

### 2.6 Reports and reconciliation

- **2.6.1** Define report filters, formulas, output fields, and reconciliation rules, including Pareto, Forecast, and unresolved daily-close behavior. — **25%**

### 2.7 Offline and sync policy

- **2.7.1** Define offline access/session policy, cache scope, queued-operation ordering, and per-domain conflict/recovery workflows. — **100%** (implemented and verified for items; see 3.4 and 3.5)
- **2.7.2** Define provisional offline document IDs, official numbering after sync, and offline receipt behavior. — **25%** (document ids are device-generated UUIDs, no numbering is generated, and an unsynced nota prints with no marker, decided in 10.1.8, 10.2.25, and 10.2.26; the receipt itself is not implemented because sales are not built)

### 2.8 API and data model

- **2.8.1** Map every included UI action to API reads/writes, validation, authorization, error outcomes, and acceptance tests. — **25%** (Barang, staff, session, and sync endpoints are mapped; other menus are not)
- **2.8.2** Design the D1 entities, constraints, relationships, migration approach, and device sync metadata for the approved workflows. — **50%** (staff, items, audit events, sync operations, recovery codes, and sessions exist; sales, invoices, stock movements, and reports do not)

### 2.9 Approval

- **2.9.1** Obtain client approval for the backend requirements, data model, and unresolved decisions before implementation. — **100%** for the Barang slice (10.1.15–10.1.17 approved); **0%** for the remaining domains

### 2.10 Exit gate

- **2.10.1** Every included UI workflow has client-approved server behavior, data rules, permissions, and measurable acceptance criteria. — **50%**: all items marked **Before first code** in phase 10 are answered or resolved (10.1), and the first slice with its acceptance criteria and todo list is approved (phase 11). The other 10 menus still need the same treatment before their own code starts.

---

## 3. Application foundation and access control — 100%

Goal: create the production application foundation and secure access before enabling pharmacy data mutations.

### 3.1 Application shell

- **3.1.1** Create the production app in `app/` using the approved target architecture and reproduce the approved UI shell without modifying `UI/`. — **100%** (shell, login, drawer, and the Barang screen are implemented; the other 10 menus are listed but disabled until their own phase)

### 3.2 Worker, D1, and deployment configuration

- **3.2.1** Create the Cloudflare Worker and D1 schema/migrations, deployment configuration, and health checks. — **100%** (deployed to the client's own Cloudflare account as a trial: Worker, static assets, and a remote D1 database are live; see 12.1)

### 3.3 Authentication and recovery

- **3.3.1** Implement staff login, logout, session handling, secure password storage, and the approved recovery method. — **100%** (username sign-in, 12-hour sessions, PBKDF2 at 100,000 iterations, one-time recovery codes, and admin reset as the fallback; no email service is required)

### 3.4 Authorization

- **3.4.1** Enforce the approved role matrix on every protected API mutation and read. — **75%** (enforced for Barang, staff, and audit endpoints; the other domains do not exist yet)

### 3.5 Abuse limits and audit

- **3.5.1** Add server-side failed-login limits and audit records for sensitive actions. — **100%** (five attempts in 15 minutes locks a username; item-edit history and staff account changes are recorded)

### 3.6 Tests

- **3.6.1** Add tests for session expiry, inactive accounts, role restrictions, and API error responses. — **100%** (68 automated tests pass across the Worker and offline suites)

### 3.7 Exit gate

- **3.7.1** The PWA and Worker are deployable, the Worker reaches D1, and protected routes reject unauthenticated or unauthorized requests. — **Verified on the real runtime.** After the Visual C++ 2015–2022 Redistributable (x64) was installed on the build machine (see [app/README.md](app/README.md)), `workerd` started: `/api/health` returned `database: reachable`, sign-in issued a session, `/api/items` rejected an anonymous request with `401`, a create operation returned `applied` and its replay returned `duplicate`, and the browser loaded the item from that server. `wrangler deploy --dry-run` read all built assets and recognised both the `DB` and `ASSETS` bindings. **Hosted deployment is done** on the client's own Cloudflare account: D1 `kromafi-apotek` (`db477559-d51d-40f3-a822-d1cb2c21904e`, region APAC) has `0001_init.sql` applied, and https://kromafi-apotek.kromafi.workers.dev serves `/api/health` with `database: reachable`, returns `401` for `/api/items`, and returns the built `index.html`. This gate covers 3.1–3.6. P1 is now answered for the domain (10.2.1) and the admin count (10.2.9); 3.8 is scope added on 2 November 2026 and is not covered by this gate. The PIN flow in 3.8 was added, verified, and later removed (10.2.20).

---

### 3.8 Account provisioning with a temporary PIN — superseded on 3 November 2026 (10.2.20)

- **3.8.1** Replace the initial-password field with a temporary one-time PIN that the new staff member uses to sign in and set their own password. — **100%** (implemented: 6 digits, 24 hours, single use, PBKDF2-hashed, shown once with a print button; signing in with it opens only the password screen, and every other API route answers 403 password_change_required until a password of at least 8 characters is set). **Superseded on 3 November 2026 (10.2.18):** the login screen no longer accepts a PIN and the screen that exchanged it for a password was removed; on the same day the remaining server-side PIN was removed too (10.2.20).
- **3.8.2** Allow any number of admin accounts, as decided in 10.2.9, while keeping the guard that the last active admin cannot be removed. — **100%** (the app already accepts multiple admins and refuses to remove the last active one)
- **3.8.3** Cover account provisioning with tests: a new account signs in with the password the admin typed at creation, a missing or too-short password is refused, and no PIN route exists any more. — **Replaced on 3 November 2026 (10.2.20)** (three tests under `account provisioning` in tests/worker.test.ts, 67 tests in total; also verified end to end against the local API)

---

## 4. Master data, purchasing, and sales — 25%

Goal: deliver the approved reference-data, goods-receipt, and cashier workflows with persisted data.

### 4.1 Master data

- **4.1.1** Build item, supplier, doctor, service, payment-method, cabinet, and pharmacy-profile management. — **100%** (items, Jasa, the four reference lists, and the pharmacy profile are implemented and tested; goods and services share one catalogue as decided in 10.2.16)
- **4.1.2** Provide a downloadable blank .xlsx template for items and services with exactly four columns, whose header names are fixed: `type`, `nama`, `harga_modal`, `harga_jual`. The template carries a few example rows marked as examples so the client knows what to type. — **0%** (decided 2 November 2026, 10.2.6 and 10.2.6a)
- **4.1.3** Import the filled workbook: validate every row first, then create the goods and services. A name that already exists rejects the whole file and lists the offending row numbers; numbers accept `1500`, `1.500`, and `Rp 1.500`; files are capped at 5,000 rows and 2 MB, so nothing is ever applied half-way. — **0%**
- **4.1.4** Test the import: valid rows, a service with an empty purchase price, an unknown type, a duplicate name, malformed and formatted numbers (`Rp 1.500`), a file over 5,000 rows, and an empty file. — **0%**

### 4.2 Purchasing

- **4.2.1** Build supplier invoice and goods-receipt creation, detail, and approved correction/payment flows. — **0%**

### 4.3 Sales

- **4.3.1** Build sales with item/service lines, approved pricing/discount/payment rules, stock checks, locking, and receipt output sized for the 58 mm thermal printer chosen in 10.2.3. — **0%**

### 4.4 Consistency

- **4.4.1** Keep purchase and sales totals consistent with their line items and record each stock-affecting movement exactly once. — **0%**

### 4.5 Tests

- **4.5.1** Add workflow tests for master-data validation, invoice totals, sale totals, payment, and stock changes. — **0%**

### 4.6 Exit gate

- **4.6.1** Staff can maintain reference data, receive goods, and complete an approved sale through the production API with correct persisted totals and stock movements. — **0%**

---

## 5. Inventory control and expiry — 0%

Goal: maintain explainable stock balances and traceable inventory corrections.

### 5.1 Stock opname

- **5.1.1** Build stock opname with the approved count schedule (once per item per calendar month), variance, staff attribution, and stale-count rejection. — **0%**

### 5.2 Stock card

- **5.2.1** Build the stock card from persisted source transactions and show item, date, quantity, category, reference, batch/expiry, staff, and note. — **0%**

### 5.3 Expiry and disposal

- **5.3.1** Build expiry review by batch and record approved disposal, damage, and supplier-return actions. — **0%**

### 5.4 Traceability

- **5.4.1** Ensure all stock corrections are authorized, atomic, and traceable without silent history changes. — **0%**

### 5.5 Tests

- **5.5.1** Add tests for concurrent stock changes, repeated opname, batch quantity, movement reversals, and expiry actions. — **0%**

### 5.6 Exit gate

- **5.6.1** The stock balance reconciles with the movement ledger, and each approved count or expiry action has a traceable result. — **0%**

---

## 6. Reports and operational visibility — 0%

Goal: provide the monitoring and evidence needed for day-to-day management.

### 6.1 Reports

- **6.1.1** Build the agreed transaction CSV, sales, stock, expired-goods, and supplier reports. — **0%**

### 6.2 Daily close — excluded from version 1.0

- **6.2.1** Daily close and cash reconciliation views are **not built**: the client decided they are outside version 1.0 (10.2.4) and the pharmacy closes cash outside the app. — **Answered** (recorded as out of scope in 15.7)

### 6.3 Analysis screens

- **6.3.1** Implement Pareto, Forecast, and Barang minus only if their inclusion and formulas are approved. — **0%**

### 6.4 Validation

- **6.4.1** Validate that totals, stock counts, and reports match actual persisted records. — **0%**
- **6.4.2** Add operational alerts for stock low, expired items, and invalid invoice totals. — **0%**

### 6.5 Exit gate

- **6.5.1** Staff and admins can review clear, trusted operational reports from the real system. — **0%**

---

## 7. Reliability and backup readiness — 25%

Goal: ensure the app remains operational and recoverable in real-world conditions.

### 7.1 Offline storage

- **7.1.1** Cache the app shell and required reference data; store all approved offline workflows and a durable outbox in per-device IndexedDB. — **50%** (service-worker shell cache and a durable outbox are verified; Barang and the five reference screens work offline, while purchasing, sales, and inventory workflows do not exist yet)

### 7.2 Visible sync states

- **7.2.1** Implement visible pending/synced/conflict/failed states and safe retry/synchronization for all offline-enabled operations. — **25%** (the Barang screen shows pending, held with a reason, and synced; the other domains do not exist yet)

### 7.3 Idempotency and conflict handling

- **7.3.1** Add idempotent write handling, server-side revalidation, and domain-specific conflict detection/resolution. — **25%** (idempotent replay, revalidation, and the item conflict rules are verified under `workerd`; the other domains do not exist yet)

### 7.4 Backup

- **7.4.1** Implement D1 backup/export, retention policy, and restore validation. — **50%** (export and restore are proven locally, and the policy is now decided in 10.2.2/10.2.2a: daily export, 30 kept copies on the pharmacy computer and external disk, monthly restore test. Not built yet: the automated daily export, the 30-file rotation, and the first remote export)

### 7.5 Restore drill

- **7.5.1** Test restore from backup at least once. — **50%** (the local drill passed: identical row counts in all seven tables, and the restored database accepted a sign-in and served the same record; restoring a hosted backup is still pending)

### 7.6 Multi-device testing

- **7.6.1** Test simultaneous online use and disconnected multi-device changes without silent data loss, duplicate operations, or broken stock totals. — **25%** (single-device offline and duplicate-replay paths are verified in tests and under `workerd`; two physical devices have not been run against each other)

### 7.7 Exit gate

- **7.7.1** The system can be recovered from a cloud backup, and device-local pending work synchronizes or enters an actionable conflict state without silent data corruption. — **50%** (the local half is demonstrated; recovery from a cloud backup needs 10.2.1 and 10.2.2)

---

## 8. Quality hardening and acceptance testing — 0%

Goal: validate that the product is ready for real use.

### 8.1 Validation and usability

- **8.1.1** Validate all server-side inputs and business rules. — **0%**
- **8.1.2** Verify keyboard usability, labels, contrast, and responsive behavior. — **0%**

### 8.2 Realistic load

- **8.2.1** Run realistic data tests for stock, invoices, and sales volume. — **0%** (target confirmed in 10.2.8: more than 150 sales per day, with indexes, pagination, and SQL-side aggregation already required by 12.5)

### 8.3 Environment checks

- **8.3.1** Check the app without a runtime CDN dependency. — **0%** (the build already bundles all assets locally; the check is not recorded as passed)
- **8.3.2** Verify print behavior for the pharmacy's receipt setup. — **0%** (target confirmed in 10.2.3: 58 mm thermal printer over USB, printed from the browser dialog, roughly 32 characters per line)

### 8.4 Acceptance

- **8.4.1** Run end-to-end acceptance testing with a small set of realistic pharmacy operations. — **0%**

### 8.5 Exit gate

- **8.5.1** The app passes the agreed acceptance checklist and demonstrates the workflow reliably. — **0%**

---

## 9. Deployment, training, and handover — 25%

Goal: prepare the Cloudflare-hosted system and offline-capable devices for stable use with the client team.

### 9.1 Hosting

- **9.1.1** Deploy the PWA and Worker to the agreed Cloudflare environment. — **50%** (deployed to a trial Worker URL on the client's account; the agreed custom domain and the per-buyer installation flow are still open, see 10.2.1)

### 9.2 Production operations

- **9.2.1** Configure D1, backup, and production access procedures. — **0%**

### 9.3 Data onboarding

- **9.3.1** Import the pharmacy's opening item and service list with the Excel import from 10.2.6 (4.1.2—4.1.4); staff, suppliers, doctors, cabinets, and payment methods are entered by hand. — **0%**

### 9.4 Parallel run

- **9.4.1** Run a one-week parallel check with the current process if needed. — **0%**

### 9.5 Training and documentation

- **9.5.1** Train the staff on cashier, stock, and admin operations. — **0%**
- **9.5.2** Document backup verification and troubleshooting. — **0%** (daily close is out of scope, 10.2.4)

### 9.6 Exit gate

- **9.6.1** The client signs off the first production version and the operational handbook. — **0%**

---

## 10. Questions to answer, confirm, or decide

Everything that needs a client answer, confirmation, or decision lives here. Each item states what is being decided, why it is needed, who decides, its current state, and the answer once given. The client-approved prototype remains the default for visible screens and interactions; these items cover only what the prototype and the already-confirmed business rules do not settle. Do not start production code for a phase while an item marked **Before first code** for it is still **Open**.

### 10.1 Blocking questions — answer before production code in the affected phase

- **10.1.1 (B1) — Lock the v1 implementation stack to React + Vite PWA, Cloudflare Pages, Cloudflare Worker, D1, and IndexedDB with a service worker?**
  - Why: the app scaffold, local development, offline storage, and migrations depend on this choice.
  - Owner: client. State: **Approved** — the client delegated the technical choice.
  - Recorded answer: use this stack. Start on Cloudflare's Free plan, which needs no card and allows commercial use, covering 7–10 devices (100k requests/day plus unlimited static-asset requests; D1: 5M rows read and 100k rows written per day, 5 GB storage, 7-day Time Travel, `wrangler d1 export` for backups). Free usage is limited, not unlimited: exceeding D1 Free limits can stop database queries until limits reset or the account upgrades, so review [Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) before launch and monitor usage.
  - Rejected alternatives: Vercel Hobby (non-commercial use only), Netlify Free (~20 production deploys/month on 300 credits), Render free Postgres (expires 30 days after creation, no backups), Fly.io and Railway (card required), Supabase Free (projects pause after a week idle, no managed backups).
  - Fallback if Cloudflare ever demands a card: Neon Free (Postgres) or Turso Free (SQLite), each needing a data-layer adapter and a re-verified deployment.

- **10.1.2 (B2) — Which devices, operating systems, and browsers must v1 support, and must users install the PWA on each?**
  - Why: service-worker behavior, storage limits, printing, and offline acceptance differ by browser and device.
  - Owner: client. State: **Approved**.
  - Recorded answer: devices confirmed as desktop/laptop, tablet, and phone. Responsive web app for current stable Chrome/Edge on desktop, Chrome on Android, and Safari on iOS/iPadOS; installation is optional but the app should be installable where the platform supports it. Revisit only if the pharmacy uses older or different devices.

- **10.1.3 (B3) — What is the expected peak number of devices using the app at the same time?**
  - Why: sets the initial multi-user concurrency and test baseline.
  - Owner: client. State: **Answered** — 7–10 devices at once.

- **10.1.4 (B4) — What setup must a new device complete before it can work offline?**
  - Why: a new device needs the PWA shell, an authorized staff identity, and a complete business-data snapshot before offline workflows are available.
  - Owner: client. State: **Approved** — implemented.
  - Recorded answer: show a setup choice of (1) sync all data from Cloudflare, or (2) import a full export package from another device. Cloud sync needs internet; imported data is labelled with its age and must be reconciled with Cloudflare when connectivity returns. The app shell must already be loaded on the new device.

- **10.1.5 (B5) — During an outage, may only the already signed-in staff member continue offline, or may another previously set-up staff member switch into their account on that device?**
  - Why: the Worker cannot deliver account revocation or role changes to a disconnected device; switching users also requires safely cached sign-in data.
  - Owner: client. State: **Approved** — implemented.
  - Recorded answer: previously set-up staff may switch users offline with their username and password. Each staff member must first have signed in online on that device so credentials can be verified locally; the Worker revalidates account status and permissions at sync.

- **10.1.6 (B5a) — If an account is deactivated while a device is offline, should Cloudflare reject every pending operation from that account, or accept operations timestamped before deactivation and reject later ones?**
  - Why: the device cannot receive revocation while offline, and distinguishing before/after relies on a device-reported time that may be inaccurate or changed.
  - Owner: client. State: **Approved** — implemented.
  - Recorded answer: offline sign-in does not expire. At sync, accept operations timestamped before deactivation and reject later ones. Keep both device-reported and server-received times; if ordering cannot be established, retain the operation for review rather than silently accepting it. Refined by 10.2.12 (3 November 2026): the compared account is each operation's recorded author, not the account that sends the queue, and the outcome for later work is `cancelled`.

- **10.1.7 (B6) — Which records may be cached on a device, and how long should cached history remain available offline?**
  - Why: more cached history lengthens first sync and uses more device storage, and increases privacy and data-loss risk; this sets cache, retention, and cleanup requirements.
  - Owner: client. State: **Approved** — implemented for items.
  - Recorded answer: all business data and history must be stored on every device. New-device setup offers Cloudflare sync or import from another device. The export package is encrypted and versioned, contains only server-confirmed business data and its sync cursor, excludes credentials, session secrets, and unsynchronized outbox entries, and import replaces only the target device's local cache — never D1.

- **10.1.8 (B6a) — Block import when the target device has pending unsynchronized operations, and exclude the source device's pending operations from a device-to-device export?**
  - Why: replacing a device cache must not silently destroy pending work or make unconfirmed transactions appear authoritative.
  - Owner: client. State: **Approved** — implemented.

- **10.1.9 (B7) — What happens if a device is lost, reset, or its browser data is cleared before pending operations sync? Is manual reconstruction from paper records acceptable?**
  - Why: pending work exists only on its originating device until the Worker confirms it in D1 and may otherwise be unrecoverable.
  - Owner: client. State: **Answered** — use manual records and re-enter pending operations on a replacement device.

- **10.1.10 (B8) — May staff complete and hand over a sale while offline using a provisional receipt/device id until Cloudflare assigns the official sale number after sync?**
  - Why: a pending sale is not yet a server-confirmed transaction, but cash may already have been taken; the cashier needs a clear rule for handover, receipt, and numbering.
  - Owner: client. State: **Answered** — allow handover with a provisional receipt/device id; assign the official sale number after successful sync.
  - Refined by 10.2.25 (3 November 2026): the nota carries no provisional or official number; it is identified by its UUID and its receipt prints no code.
  - Refined again by 10.2.26 (3 November 2026): a nota that has not synced may be printed as soon as it is locked, with no marker on the receipt.

- **10.1.11 (B9) — When one queued operation conflicts or fails, should synchronization stop for that device, or continue with independent operations while holding dependent ones?**
  - Why: determines whether a sync batch is atomic or can partially succeed, and how staff understand the resulting state.
  - Owner: client. State: **Answered** — implemented. Continue independent operations; hold only operations that depend on the failed or conflicting change and show them for review.

- **10.1.12 (B10) — If two devices edit the same master-data record while offline, should the latest device-reported change time determine the active value, with every edit retained in chronological audit history?**
  - Why: device clocks may differ, so both device-reported and server-received time must be preserved, and clock skew and ties need a safe technical rule.
  - Owner: client. State: **Answered** — implemented. Use the latest device-reported change time as the active value and retain all edits with timestamps in the audit history. Uncertain ordering is flagged for review rather than silently guessed.

- **10.1.13 (B11) — If two devices record payment of the same supplier invoice while offline, should the first payment accepted by Cloudflare remain active and later attempts be held for admin review, with both attempts preserved in the audit history?**
  - Why: prevents double settlement; financial actions should not be reordered by device clock or silently overwrite one another.
  - Owner: client. State: **Answered** — yes. Applies when invoicing is built (phase 4).

- **10.1.14 (B12) — For an offline sale, should the sale keep the item name and price shown when staff completed it, even if the item is edited or deactivated before sync?**
  - Why: the sale must represent what the customer actually bought and paid for and must not silently change when catalog data changes.
  - Owner: client. State: **Answered** — yes; preserve the transaction-time item name and price snapshot. Applies in phase 4.

- **10.1.15 (B13) — Who may review and resolve sync conflicts, and may that person edit and re-submit the operation or only accept/reject it with a corrective transaction?**
  - Why: conflicts must remain visible and auditable, and the resolution flow needs a clear role and outcome.
  - Owner: client. State: **Answered** — implemented. Any active staff member may resolve conflicts; the resolution action and resulting correction stay in the audit history.

- **10.1.16 (B14) — What is the first implementation slice, and what must it demonstrate?**
  - Why: after the platform, supported devices, offline prerequisites, and key risks are clear, the first code and tests need a bounded target.
  - Owner: client. State: **Answered** — the Barang offline vertical slice: manage items online through D1, queue edits offline as pending, then sync and confirm them when online. Detailed in phase 11.

- **10.1.17 (B15) — Approve the Barang first-slice scope and acceptance criteria, including the technical defaults noted for approval?**
  - Why: acceptance criteria must be agreed before finalizing the executable todo list.
  - Owner: client. State: **Approved** — first-slice scope and acceptance criteria approved; offline account switching uses username and password as recorded in 10.1.5, with no extra PIN. See 11.1 and 11.3.

- **10.1.18 (B16) — Approve the implementation todo list?**
  - Why: implementation tasks must be agreed before work begins; permission to start coding is requested separately in 10.1.19.
  - Owner: client. State: **Approved** — todo list approved as written. See 11.4.

- **10.1.19 (B17) — Explicitly authorize starting production code once scope, acceptance criteria, and the todo list are approved and first-slice blockers are resolved?**
  - Why: approval of a plan and its tasks is not by itself permission to begin coding.
  - Owner: client. State: **Approved** — authorization given ("saya izinkan"); implementation lives in `app/` (see [app/README.md](app/README.md)).

### 10.2 Questions that may be resolved before their relevant phase

These are not blockers for an unrelated first slice. Resolve each before implementing the feature or deploying to production; if a phase depends on one, treat it as blocking for that phase.

- **10.2.1 (P1) — Which Cloudflare account owns the app, who has admin access, which environments are required, and what domain will be used?**
  - Resolve before: first shared deployment. Owner: client. State: **Partly answered**.
  - Recorded answer (domain, 2 November 2026): keep https://kromafi-apotek.kromafi.workers.dev as the permanent address; no custom domain is bought or attached.
  - Still open: the second admin account (10.2.9) and the explicit confirmation of which Cloudflare account owns the installation. Never record credentials here.

- **10.2.2 (P2) — What is the D1 backup/export schedule, retention period, and acceptable recovery point/time, and who can perform and verify a restore?**
  - Resolve before: production data use. Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer (location, 2 November 2026): the exported `.sql` file stays on the pharmacy computer and an external hard disk; no cloud copy. Because the file contains staff usernames and PBKDF2 hashes, it is treated as a secret: never committed, never shared through chat or a shared folder, and the external disk is kept at the pharmacy.
  - Completed by 10.2.2a: daily export, 30 kept copies, and a monthly restore test run by an admin. No part of P2 is still open.

- **10.2.2a — How often is a backup export made, and how many copies are kept? (follows from 10.2.2)**
  - Why: the interval sets how much data can be lost if the database is damaged; retention sets how far back a restore can reach.
  - Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: one export per day, after the pharmacy closes; the 30 most recent files are kept on the pharmacy computer and the external hard disk, and older files are deleted. An admin runs one restore test per month into an empty database and compares row counts.

- **10.2.3 (P3) — Which receipt printer model, paper width, and browser print workflow must be supported?**
  - Resolve before: receipt implementation and acceptance (phase 4). Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: a 58 mm thermal receipt printer connected over USB. Sales print through the browser's print dialog to that printer, so no driver integration, no raw ESC/POS command channel, and no printer-specific bridge is built. Receipt layout must fit a 58 mm roll (about 32 characters per line at the usual font).

- **10.2.4 (P4) — Is daily close/cash reconciliation part of v1, and what totals, payment breakdowns, and adjustments must it include?**
  - Resolve before: reports and operational close (phase 6). Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: **no**. Daily close and cash reconciliation are not part of version 1.0; the pharmacy counts and closes cash outside the app. Version 1.0 only provides daily transaction reports that can be printed or exported (12.4.17). Recorded as out of scope in 15.7.

- **10.2.5 (P5) — What password recovery method will be used, and will an email or other delivery service be available?**
  - Resolve before: production sign-in. Owner: client. State: **Resolved** — no email service. Cloudflare's free tier routes inbound mail only and sells no outbound transactional email; every free sender requires a verified domain, which breaks the "free, no payment method" constraint. One-time recovery codes are implemented instead: eight per account, stored as salted hashes, single use, printable, usable offline, with admin reset as the fallback.

- **10.2.6 (P6) — How will opening stock, staff, and reference data be supplied, validated, and imported?**
  - Resolve before: production data onboarding (phase 9). Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: items and services are imported from an Excel workbook. The app offers a blank template to download; the client fills it in and uploads it back. Columns are exactly: `type` (barang or jasa), item or service name, purchase price (**goods only**), and selling price. Staff accounts, suppliers, doctors, cabinets, and payment methods are not part of the import and are entered through their own screens.

- **10.2.6a — What are the detailed rules of the Excel import? (follows from 10.2.6)**
  - Why: the import writes real master data, so row-level validation and failure reporting must be decided before it is built.
  - Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: the header row is fixed with exactly `type`, `nama`, `harga_modal`, `harga_jual`. Numbers may be written `1500`, `1.500`, or `Rp 1.500` and are read as whole rupiah. A name that already exists rejects the whole file and lists the offending row numbers, so the import never creates duplicates and never updates a price silently. `harga_modal` may be empty for services. Limits: 5,000 rows and 2 MB per file, and the whole file is validated before anything is written.

- **10.2.7 (P7) — What privacy, retention, and export/deletion requirements apply to patient-related and financial records?**
  - Resolve before: final schema and production readiness. Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: a sale may store the patient name, and transaction history is kept **permanently** with no automatic deletion. There is no customer-facing access, no public link, and no per-patient portal; patient names are read only by an authenticated staff session. Deleting individual records on request is not a version 1.0 feature, so these names must be handled as confidential pharmacy records: exports and backups carry them (10.2.2) and are treated as secrets.

- **10.2.8 (P8) — What is the approximate number of sales and inventory operations per day?**
  - Resolve before: load and performance testing (phase 8). Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: **more than 150 sales per day** at peak. Consequences to honour: every filtered column is indexed, long lists are paginated instead of loaded whole, dashboard and report queries aggregate in SQL rather than in the browser, and weekly D1 row-read/row-write usage is watched so a busy day never hits the Free-plan ceiling (14.6). Load testing in phase 8 targets this volume.

- **10.2.9 — How many admins does the pharmacy need? (related to 10.2.1)**
  - Why: the installation must fit each buyer's own staffing, and the app must not impose a fixed number of admin accounts.
  - Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: the number of admins is free and decided by the buyer of each installation; there is no fixed limit. Every account, admin or staff, is created in the Petugas menu.

- **10.2.10 — How should the temporary PIN work when an account is created in the Petugas menu?** *(superseded by 10.2.20)*
  - Why: 10.2.9 makes the Petugas menu the only place accounts are created, but the current form asks the admin to type an initial password for the other person instead of issuing a temporary PIN. See 3.8.
  - Owner: client. State: **Answered** (2 November 2026).
  - Recorded answer: a **6-digit numeric PIN**, valid for **24 hours**, usable **once**, shown to the admin exactly once at creation and printable on paper. Signing in with the PIN does not open the app: it opens a mandatory screen where the staff member sets their own password (at least 8 characters), and only then is the session usable. The PIN is stored as a salted hash like the recovery codes, a deactivated account cannot use it, and issuing a new PIN invalidates the previous one.
  - Implemented in 3.8 (worker/src/pin.ts, the login PIN branch, and the forced password screen). **Removed on 3 November 2026** (10.2.20): the PIN, its login branch, its route, and its screen are gone.

- **10.2.11 — What should the single "Edit" button on a staff member's own account detail do?**
  - Why: the client asked for exactly one button on the own account detail, and said a name and username must not change, while the server refuses to let anyone change their own role or status. That leaves only a self-service password change, but the client has not confirmed it.
  - Owner: client. State: **Answered**.
  - Recorded answer (3 November 2026): the client approved the outcomes list for the Petugas fixes, which stated this behaviour, so the button changes the staff member's own password. Any change of role and status stays with an admin and is refused for one's own account.
  - Implemented: the button opens a form that shows the name and username as read-only text and lets the staff member set a new password of at least 8 characters.

- **10.2.12 — Should offline work recorded by an account that is later deactivated be cancelled when it reaches the server, even if another active account sends it?**
  - Why: reported bug — work queued by a deactivated account was still approved once an active account signed in on the same device and pressed sync; the server only checked the status of the signed-in sender.
  - Owner: client. State: **Answered**.
  - Recorded answer (3 November 2026): yes. Every operation carries the account that recorded it plus the device time at which it was recorded, and device clock differences between devices are accepted as they are. The server stores each account's deactivation time and re-checks status while processing. Work recorded after that time is **cancelled** (`account_deactivated`) and never applied; work recorded earlier stays acceptable under B5a and its audit note says `operation_before_deactivation`. When the sender differs from the author, the note adds `pushed_by:<staffId>`, and the audit row belongs to the author. Reactivating an account clears its deactivation time so a later deactivation records a fresh one, and deactivating an account closes any ledger row the server had already claimed for it.
  - Implemented in `worker/src/sync.ts`, `worker/src/staff.ts`, migration `0005_operation_author.sql`, and the device outbox (`src/lib/sync.ts`, `src/components/BarangPage.tsx`).

- **10.2.13 — Should cancelled offline work be reported to the device or to the admin?**
  - Why: the first 10.2.12 build showed a notice ("N perubahan dibatalkan…") and kept a **Dibatalkan** entry in the outbox, which asks the staff member to react to work the server has already refused for good.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: cancellation is **silent**. The server decides it while processing, the device drops the operation from its outbox, and nothing is shown — no notice, no confirmation, no cancelled row in the Barang list. The audit ledger still records the cancelled operation, so an admin can inspect it there.
  - Implemented in `src/lib/sync.ts`, `src/App.tsx`, and `src/components/BarangPage.tsx`.

- **10.2.14 — What is the password reset procedure, and which accounts may use it?**
  - Why: the Petugas screen offered **Reset password** for every other account, including deactivated ones, and the server accepted it.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: an admin resets another account's password from its detail by typing a new temporary password of at least 8 characters. The button is shown and the request accepted **only while the target account is Aktif**; a deactivated account must be reactivated first, so a dormant credential is never changed blind. A reset ends every session of that account and is written to the audit log with the acting admin and the target, never with password data. The admin hands the temporary password over, and the staff member changes it from their own account detail after signing in. The Staff role cannot use this route at all.
  - Implemented in `src/components/PetugasPage.tsx` and `worker/src/staff.ts`.

- **10.2.15 — How does the pharmacy recover when the only admin forgets their password?**
  - Why: an admin cannot reset their own password from the Petugas screen and the last active admin cannot be deactivated, so a single-admin installation has no in-app path once its recovery codes are lost.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: the client approved the three steps below as the standing procedure, used in the stated order, and no new in-app recovery path is built. The eight one-time recovery codes come first, a second active admin on every installation is the normal fallback, and the break-glass terminal command is the last resort. A credential-free in-app admin reset is not added, because possession of the deployment is the only safe proof of ownership while no email service exists (P5). Creating that second admin stays with 10.2.9, and the installation scope with 10.2.1.
  - Recommendation, in this order: (1) the eight one-time recovery codes issued at bootstrap, printed and stored safely, are accepted by `POST /api/recovery/reset`, which the login screen no longer links (10.2.18); (2) a second active admin on every installation, so each can reset the other from Petugas; (3) the break-glass command `node scripts/bootstrap-admin.mjs --remote --reset --username <admin>`, which needs a terminal and the Cloudflare account credentials, so possession of the deployment is the proof of ownership. A shipped app cannot safely offer "reset any admin without a credential", and no email service is available (P5).

- **10.2.16 — Should services (Jasa) share one catalogue table with goods (Barang)?**
  - Why: the agreed Excel import (10.2.6) already treats goods and services as one list with a `type` column, and 4.1.1 builds both screens from one catalogue.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **yes, one catalogue.** A service becomes a row in `items` with `type = 'jasa'`, an empty or zero `harga_modal`, and no unit, stock, or cabinet; a name stays unique across both kinds, exactly as the import requires. Implemented in migration `0007_item_type.sql`, `worker/src/items.ts`, and `src/components/JasaPage.tsx`: `items.type` is `barang` or `jasa` with a `CHECK` constraint, a service stores an empty unit, zero purchase price, zero stock, and an empty cabinet, and the name stays unique across both kinds.

- **10.2.17 — Should the doctor, cabinet, payment-method, and supplier lists share one generic table?**
  - Why: the four lists carry the same two visible fields, so one table with an `entity_type` column looks simpler.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **no, keep separate tables** (`doctors`, `cabinets`, `payment_methods`, `suppliers`). A typed foreign key must not be able to point at the wrong kind of record, each list will need its own fields (contact details, a cash flag, a physical location), and one shared table would weaken per-list name uniqueness. They share one column pattern and one generic screen in the app instead.

- **10.2.18 — How should the login and pharmacy-profile screens behave for staff?**
  - Why: the client asked for a simpler login and a profile that staff cannot edit, without an explanatory warning.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: the login screen keeps one password form. The *Punya PIN sementara?* link, the *Lupa password?* link, and the screen that exchanged a PIN for a password are removed from the app; the recovery route stays on the server but the app no longer calls it, and an admin onboards a new account with **Reset password** in Petugas. The login title shows the **pharmacy name from the database** through the public `GET /api/pharmacy`, cached on the device so it also appears offline. On **Profil apotek**, Nama apotek and Alamat stay visible but are read-only for staff, with the *hanya dapat diubah oleh admin* warning removed; an admin still edits them.
  - Implemented in `src/components/LoginPage.tsx`, `src/App.tsx`, `src/components/ProfilApotekPage.tsx`, `worker/src/index.ts`, and the removed `SetPasswordPage.tsx`.

- **10.2.19 — Should Tunai be a fixed payment method?**
  - Why: every sale needs a payment method that is always available, and a deactivated Tunai would leave the cashier without a fallback.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **Tunai is seeded and locked.** Migration `0008_payment_tunai.sql` inserts `payment_method_tunai` with the name `Tunai` and status `Aktif`; the Worker rewrites its name and status on every push, so neither a staff member nor an admin can rename or deactivate it, and the screen hides the edit action and labels the row *Wajib*. Other payment methods keep the normal active/inactive lifecycle.
  - Implemented in `worker/migrations/0008_payment_tunai.sql`, `worker/src/reference.ts`, `worker/src/entities.ts`, `worker/src/sync.ts`, and `src/components/ReferencePage.tsx`.

- **10.2.20 — Should the temporary PIN stay now that the login screen has one password form?**
  - Why: with no PIN entry, the PIN issued at account creation could never be used, so creating an account ended in a dead end.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **remove the PIN entirely.** Creating an account now takes an initial password of at least 8 characters that the admin types and hands to its owner. The PIN generator, the `POST /api/staff/:id/pin` route, the `POST /api/login` PIN branch, the forced-password guard, and the PIN dialog are gone; migration `0009_drop_pin.sql` drops `staff.pin_hash`, `pin_salt`, `pin_iterations`, `pin_expires_at`, and `sessions.must_change_password`. A staff member changes their own password from their account detail, and an admin can still reset it (10.2.14).
  - Implemented in `worker/src/staff.ts`, `worker/src/auth.ts`, `worker/migrations/0009_drop_pin.sql`, `src/components/PetugasPage.tsx`, and `src/lib/api.ts`.

- **10.2.21 — Should the sidebar title show the pharmacy name from the database?**
  - Why: the sidebar brand was hard-coded as *Kromafi Apotek* while the pharmacy profile in D1 is named *Kromafi Farma*, so one screen showed two different pharmacy names.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: the sidebar shows the pharmacy name from the database — the same value the login screen already reads through `GET /api/pharmacy` — cached on the device so it also appears offline. The hard-coded *Kromafi Apotek* stays only as the fallback used before any pharmacy profile has been loaded. An installation bought by another pharmacy therefore shows its own name without a code change.
  - Implemented in `src/components/Shell.tsx` and `src/App.tsx`.

- **10.2.22 — Which screen keeps the fixed *Kromafi Apotek* title?**
  - Why: after 10.2.21 the login title and the sidebar both read the database name, but the client wants the reverse of what 10.2.21 implied: the login screen carried the database name while the sidebar still showed *Kromafi Apotek*.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **the login title is fixed as *Kromafi Apotek* and never changes**; the sidebar brand is the only place that shows the pharmacy name from the database. The login screen no longer receives a name prop, and the public `GET /api/pharmacy` read stays only to fill and cache the sidebar name, so the sidebar still shows it offline.
  - Implemented in `src/components/LoginPage.tsx` and `src/App.tsx`.

- **10.2.23 — Which status filter is selected by default on the master screens?**
  - Why: every master list opened on *Semua*, so the screen showed inactive records first and the client had to change the filter by hand on each visit.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **Aktif is the default filter** on Barang, Jasa, Petugas, Lemari, Distributor, Dokter, and Metode pembayaran. *Semua* and *Tidak aktif* stay available so the inactive records are never hidden permanently.
  - Implemented in `src/App.tsx`, `src/components/PetugasPage.tsx`, `src/components/ReferencePage.tsx`, and `src/components/JasaPage.tsx`.

- **10.2.24 — How is the final selling price per unit calculated after both discounts?**
  - Why: reports and margin checks need the price actually received per unit, not the catalogue price, and the nota-level discount has to reach every line somehow.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **`harga jual final = harga jual − (diskon tagihan ÷ jumlah) − (diskon total tagihan ÷ total jumlah unit seluruh nota)`.** The line discount is divided by that line's own quantity; the nota-level discount is spread evenly across every unit in the nota, not proportionally to line value. Because both subtractions are exact per unit, `Σ(harga jual final × jumlah)` equals `total_tagihan_final` with no remainder, so a per-unit value is rounded only when it is displayed, never before the multiplication.
  - Not implemented yet: the Penjualan menu and the `sales`/`sale_lines` tables are still planned.

- **10.2.25 — Should a sales nota have a provisional number offline and an official number after sync?**
  - Why: 10.1.10 approved a provisional receipt followed by a server-assigned official number, but the client asked whether any number is needed at all when every nota already carries a device-generated UUID.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **no nota number of any kind.** Each nota is identified only by its UUID, generated on the device when the nota is created, so nothing is reserved offline and nothing is assigned after sync. The printed receipt carries **no code at all** — no provisional number, no official number, and not even a shortened UUID — so it shows only the pharmacy profile, the lines, the totals, the cashier, and the printing date and time. Finding an old nota uses its date, time, amount, or cashier. This supersedes the numbering part of 10.1.10.
  - Not implemented yet: the Penjualan menu and the `sales`/`sale_lines` tables are still planned.

- **10.2.26 — May a receipt be printed while the device is offline and the nota is not yet synced?**
  - Why: the cashier must hand over proof of payment at the counter even when the connection is down, and a marker on the receipt raises a question the staff cannot answer at that moment.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **yes, print immediately with no marker.** The receipt is identical whether or not the nota has reached the centre: no *belum tersinkron* note, no warning, and no separate layout. A pending nota stays in the device outbox until the centre confirms it. Because the approved prototype prints only after the nota is locked, locking follows the same rule: the signed-in staff member locks the nota on the device while offline, that lock is queued like any other change, and printing never waits for the network.
  - Not implemented yet: the Penjualan menu and the `sales`/`sale_lines` tables are still planned.

- **10.2.27 — How does a sale reduce stock when several devices can sell offline?**
  - Why: `items.stok` is a stored number edited by the Barang form under per-row versioning, so a sale that wrote it the same way would make two offline devices overwrite each other's stock.
  - Owner: client. State: **Answered** (3 November 2026).
  - Recorded answer: **the server reduces stock when the nota arrives.** A device sends only the nota; the Worker decrements `items.stok` once per goods line and writes one `stock_movements` row per decrement in the same transaction. Two devices selling the same item therefore add up instead of replacing each other, and the Barang form keeps working exactly as it does today. Services never touch stock.
  - Not implemented yet: `stock_movements` and the Penjualan menu are still planned.

### 10.3 Decisions already settled — do not ask again

- **10.3.1** The product is a PWA for one pharmacy, used by multiple staff on multiple devices.
- **10.3.2** The hosted platform is Cloudflare Pages + Workers + D1; D1 is the authoritative shared database.
- **10.3.3** All approved workflows may be entered offline on a device whose app and required data are already cached.
- **10.3.4** Offline changes remain **pending** until the Worker confirms them in D1; disconnected devices do not share new changes.
- **10.3.5** Keep the approved prototype screens and visible interactions as the default, and apply the client-confirmed business rules in 12.6, including full payment for sales, allowed negative stock, and recounting stale stocktakes.

---

## 11. First implementation slice — Barang offline vertical slice

Goal: prove the approved PWA + Cloudflare architecture with one complete, low-risk business workflow before building sales or supplier-payment flows. Free-plan usage is monitored because exceeding D1 limits stops queries.

### 11.1 Included

- **11.1.1** React + Vite PWA shell, responsive for desktop/laptop, tablet, and phone. — **100%**
- **11.1.2** Cloudflare Worker API and a D1 schema/migration for staff, items, audit history, and idempotent sync operations. — **100%**
- **11.1.3** Online staff sign-in and device provisioning; previously provisioned staff can switch accounts offline with username and password verified against protected local credentials; account status and permissions are revalidated at sync. — **100%**
- **11.1.4** Barang list/search and create/edit/activate/deactivate backed by D1. — **100%**
- **11.1.5** IndexedDB item cache and durable item-operation outbox; offline edits survive reloads and stay visibly pending until confirmed. — **100%**
- **11.1.6** Sync independent item operations after reconnection, deduplicate retries, and hold dependent or invalid operations with a clear status. — **100%**
- **11.1.7** Preserve every conflicting item edit in audit history, using the latest device-reported timestamp as the active value while retaining server-received time and holding suspicious ordering for review. — **100%**
- **11.1.8** New-device setup offering **Sync from Cloudflare** or **Import file from another device**, with an encrypted, versioned export package covering the Barang dataset only. — **100%**

### 11.2 Not included

- **11.2.1** Sales, invoices, stocktakes, expiry, the full-history export for all future domains, production launch, and printer integration. The full export/import package must cover every business-data domain before the v1 offline rollout.

### 11.3 Acceptance criteria

- **11.3.1** Online item create/edit/deactivate persists in D1 and appears on another device after sync. — **Verified**
- **11.3.2** After the app and item dataset are loaded, a device can go offline, create or edit an item, reload the app, and still see the operation marked **pending**, not confirmed. — **Verified**
- **11.3.3** Reconnection applies each valid operation once; safe retries never duplicate records; an independent operation continues while dependent work is held. — **Verified**
- **11.3.4** Two-device edits preserve both audit events in chronological history; the latest valid device-reported timestamp determines the active value, and clock uncertainty is surfaced for review. — **Verified**
- **11.3.5** Each operation records its author, and the server compares that author's deactivation time with the operation's device time when the operation is processed: later work is cancelled even when an active account sends the queue, earlier work is applied and noted, and in-flight ledger rows are closed on deactivation. Cancelled or held operations stay visible and auditable. — **Verified**
- **11.3.6** A new device can initialize Barang data from Cloudflare sync or the encrypted export package; import changes only the local cache and is blocked when the target has pending work. — **Verified**
- **11.3.7** Automated tests cover online persistence, offline reload, two-device sync, idempotency, author-based deactivation, clock conflicts, import validation, and permissions. — **Verified** (67 tests)

### 11.4 Implementation todo list

- **11.4.1** Scaffold the React/Vite PWA and Cloudflare Worker/D1 local-development setup. — **100%**
- **11.4.2** Add minimal D1 migrations for staff/device provisioning, items, audit events, and sync-operation idempotency. — **100%**
- **11.4.3** Implement online authentication, local credential provisioning for offline username/password verification, and server-side permission checks. — **100%**
- **11.4.4** Implement the Barang API and responsive UI for list/search/create/edit/activate/deactivate. — **100%**
- **11.4.5** Add service-worker app-shell caching, IndexedDB item cache, durable pending outbox, and visible connection/sync states. — **100%**
- **11.4.6** Implement idempotent Worker synchronization, timestamp/audit conflict handling, and account-deactivation checks. — **100%**
- **11.4.7** Implement the first-run Cloudflare-sync/import choice and encrypted, versioned Barang export/import with safe replacement guards. — **100%**
- **11.4.8** Add automated tests and demonstrate the acceptance criteria across two independent devices. — **100%** (tests pass; the two-device demonstration is covered by automated and `workerd` runs, not two physical devices)

### 11.5 Authorization checklist

- **11.5.1** Every blocking question in 10.1 has a recorded answer or approved default. — **Done**
- **11.5.2** The chosen first slice has observable acceptance criteria and tests. — **Done** (11.3)
- **11.5.3** Its implementation todo list is approved by the client. — **Done** (10.1.18)
- **11.5.4** Any unanswered `P` item the slice depends on has been promoted into 10.1 and resolved. — **Done**
- **11.5.5** The client explicitly approves starting production code. — **Done** (10.1.19)

---

## 12. Reference material

### 12.1 Verified current state (3 November 2026)

- **12.1.1** `UI/` contains the client-approved prototype and workflow baseline for all 18 menus, including flows and browser-local workflow simulation. It is not the production source.
- **12.1.2** `app/` contains the production application for the Barang and reference-data slices: React/Vite PWA, Worker API, D1 migrations, offline outbox, idempotent sync, conflict history, staff administration, recovery codes, and encrypted export/import.
- **12.1.3** Automated checks pass: `npm run typecheck` is clean, `npm test` runs 67 tests across the Worker and offline suites, and `npm run build` produces the deployable PWA.
- **12.1.4** The app is deployed as a trial to the client's own Cloudflare account at https://kromafi-apotek.kromafi.workers.dev, with D1 `kromafi-apotek` (`db477559-d51d-40f3-a822-d1cb2c21904e`, region APAC) migrated and a first admin (`admin`) created by `npm run staff:bootstrap -- --remote --username admin`. Staff sign in with a username, not an email.
- **12.1.5** Workers compatibility is verified on the real `workerd` runtime: `wrangler dev` runs against a local D1 database, and health, sign-in, `401` handling, idempotent sync, and browser reads behave as designed. The earlier `write EOF` fault was an environment defect — a missing Visual C++ 2015–2022 Redistributable (x64) left `workerd.exe` unable to load its UCRT libraries — and installing it fixed the machine.
- **12.1.6** `workerd` caps PBKDF2 at 100,000 iterations, so the deployed Worker rejected the earlier 210,000-iteration hashes with `500` on every sign-in while local runs stayed green. The setting is now 100,000 — the runtime maximum — and sign-in on the deployed Worker returned `200`. Because older credentials cannot be re-derived, `npm run staff:bootstrap -- --reset` replaces a password and ends its sessions.
- **12.1.7** A full local backup drill passed: export, restore into an empty database, identical row counts in all seven tables, and the restored database accepted a sign-in and served the same record. Cloudflare Time Travel covers the last 7 days; the export is the portable copy.
- **12.1.8** Known limits: eight screens are implemented (Barang, Jasa, Petugas, Lemari, Metode pembayaran, Dokter, Distributor, Profil apotek) and the other 10 prototype menus are listed but disabled; the custom domain and second admin are open (10.2.1); backup schedule and retention are open (10.2.2); daily close has no prototype workflow (10.2.4).
- **12.1.9** Selling model confirmed by the client: each buyer uses **their own** Cloudflare account, so one installation means one account, one Worker, one database, and one pharmacy's data. The install sequence in [app/README.md](app/README.md) is the per-buyer procedure.
- **12.1.10** Migrations `0001`–`0007` are applied on the remote D1 database, and Worker version `ccf2d495-55f6-4bd1-97b6-a2a7070ca8b3` (commit `92432c9`) is live with the reference screens and the shared goods-and-services catalogue. Offline work is attributed to the account that recorded it and cancelled at processing time when that account was already deactivated (10.2.12); the device now drops such work silently (10.2.13). A password reset is offered and accepted only for an account that is Aktif (10.2.14). Live checks after that deploy: `/api/health` `200`, `/api/sync/snapshot` and `POST /api/staff/:id/password` without a session `401`, and the served bundle carries the new Jasa, Metode pembayaran, Profil apotek, and Petugas text.

- **12.1.12** Worker version `a9aee398-b26c-4479-b5bf-a1d7e0dcb09a` serves the one-form login, the read-only staff profile, and the locked Tunai method (10.2.18–10.2.20). Live checks after that deploy: `/api/health` `200`, `/api/pharmacy` returns the pharmacy name without a session, `POST /api/staff/:id/pin` answers `404`, and the served bundle is `index-B_seKYx9.js`.

- **12.1.11** The Jasa, Lemari, Metode pembayaran, Dokter, Distributor, and Profil apotek screens are implemented on the same offline-sync engine as Barang. Migration `0006` adds `cabinets`, `payment_methods`, `doctors`, `suppliers`, and `settings`; migration `0007` adds `items.type`, so goods and services share one catalogue and one name space (10.2.16). Migrations `0006` and `0007` are applied to both the local and the remote D1 database. Migration `0008_payment_tunai.sql` seeds the locked Tunai payment method (10.2.19) and `0009_drop_pin.sql` removes the PIN columns (10.2.20); both are applied to the local and the remote D1 database.

### 12.2 Target outcome for version 1.0

Version 1.0 must serve one pharmacy with multiple staff and devices through Cloudflare Pages, Workers, and D1. Core workflows must stay usable during internet outages on devices that have already loaded the app; each device stores its own offline data and pending operations until they synchronize.

- **12.2.1** Manage staff accounts and roles securely.
- **12.2.2** Manage items, units, cabinets, suppliers, doctors, payment methods, and service lists.
- **12.2.3** Handle cashier sales with item search, pricing, discounts, payment, and receipt output.
- **12.2.4** Receive goods and create supplier invoice records.
- **12.2.5** Manage stock adjustments and opname checks.
- **12.2.6** Detect and track expired goods.
- **12.2.7** View operational reports using real persisted data.
- **12.2.8** Enforce server-side validation and role permissions.
- **12.2.9** Support offline use of all approved workflows, with explicit pending/synced/conflict status.
- **12.2.10** Synchronize device changes to the authoritative cloud database without silently overwriting conflicts.
- **12.2.11** Provide a tested backup and restore process for D1.
- **12.2.12** Run reliably on Cloudflare with multi-user, multi-device access.

### 12.3 Target architecture for version 1.0

```
Browser (React/Vite PWA)
   ├─ cached application shell
   ├─ IndexedDB: device cache and durable pending-operation outbox
   │
   │ JSON requests / queued-operation sync
   ▼
Cloudflare Worker API
   │
   ▼
Cloudflare D1 (authoritative shared database)
```

- **12.3.1** Each device works from its own cached snapshot while offline. Pending operations are not confirmed business records until the Worker accepts them and commits them to D1.
- **12.3.2** Devices do not share offline changes in real time; after reconnection the server validates queued operations against current cloud state and marks rejected or conflicting operations for review.
- **12.3.3** Internet is required to reach Cloudflare and synchronize, but not to continue using already-cached workflows locally.
- **12.3.4** Frontend: React/Vite app in `app/` — the real user interface.
- **12.3.5** API: Cloudflare Worker with real endpoints — business logic, validation, security, synchronization, and persistence.
- **12.3.6** Database: Cloudflare D1 — shared authoritative database for all online devices.
- **12.3.7** Auth: server-side authentication and role checks — enforce staff access rules and protect business data.
- **12.3.8** Hosting: Cloudflare Workers with static assets — serve the PWA and API to multiple devices.
- **12.3.9** Offline storage: per-device IndexedDB plus cached app shell — retain cached records and pending operations while disconnected.
- **12.3.10** Backup: D1 export with restore verification — protect cloud business data and prove recovery.

### 12.4 Backend feature inventory from the approved UI

The approved prototype is the default baseline for version 1.0 screen scope and visible interactions. Browser storage and mock data are prototype implementation details, not production persistence rules. The client-confirmed rules in 12.6 take precedence; clarify only behavior the prototype does not specify and that affects implementation.

- **12.4.1 Login and logout** — Authenticate staff, create/end a server session, and return the current user's identity and permissions. The prototype locks an account after five failed attempts in a 15-minute window; production enforcement is server-side. — **Implemented**
- **12.4.2 Lupa password** — Provide a secure recovery or admin reset flow. The prototype reports that reset links are unavailable because no server or email service is configured. — **Implemented** as one-time recovery codes (10.2.5) through `POST /api/recovery/reset`, which the login screen no longer links (10.2.18); an admin can also reset a password from the Petugas detail (10.2.14)
- **12.4.3 Petugas** — List and maintain staff accounts, roles, active status, and credentials; account management is admin-only and staff can view their own record. — **Implemented**
- **12.4.4 Barang** — Search, list, create, update, and deactivate items with name, unit, cabinet, prices, and stock visibility; record every stock edit as an audited movement. — **Implemented** for items; stock movements belong to phase 5
- **12.4.5 Distributor** — Maintain supplier records and active status for purchasing; existing invoices keep their recorded supplier name. — **Planned**
- **12.4.6 Dokter** — Maintain doctor records and active status; optional doctor selection in sales. — **Planned**
- **12.4.7 Jasa** — Maintain service names, prices, and active status; active services are selectable in sales and consume no stock. — **Planned**
- **12.4.8 Metode pembayaran** — Maintain active payment methods; one method per sale, no split tender. — **Planned**
- **12.4.9 Lemari** — Maintain cabinet names and active status; retain historical item references when a cabinet changes or is deactivated. — **Planned**
- **12.4.10 Profil apotek** — Read and update the pharmacy name and address used by the interface and receipts; admin-only edit. — **Planned**
- **12.4.11 Penjualan** — Search and select items/services; save sale headers and lines, prices, quantities, discounts, payment, patient/doctor details, cashier, and receipt data. Preserve the prototype's lock/unlock/delete/print flow; the API calculates totals and records stock movements for goods, not services; batch is optional and does not determine stock allocation. Patient name is stored permanently when filled in (10.2.7). — **Planned**
- **12.4.12 Faktur orderan** — Record supplier invoices and received goods with supplier, dates, lines, quantities, cost, discount, tax, margin, selling price, batch, and expiry. Stock increases on save regardless of payment; box lines convert to units; the prototype's percentage discount/tax and margin calculations apply. — **Planned**
- **12.4.13 Tagihan** — List unpaid supplier invoices by supplier and due month, show totals and due status, and record payment dates. Invoices are unpaid or paid in full; admins may cancel a recorded payment. — **Planned**
- **12.4.14 Stok opname** — Record physical count, system count, variance, period, date, and staff; update stock and preserve the variance; one opname per item per month; stale counts must be reopened and recounted. — **Planned**
- **12.4.15 Kartu stok** — Query an item movement ledger with dates, quantity, category, source document, batch/expiry, staff, and notes; combine sales, invoices, opname, and expired transactions; keep corrections auditable. — **Planned**
- **12.4.16 Expired** — List received items by expiry date and record disposal or supplier return with item, quantity, batch metadata, invoice, supplier, date, and staff; damaged goods use the same workflow; supplier returns reduce stock only. — **Planned**
- **12.4.17 Laporan** — Generate transaction exports for a date range from sales, invoices, stocktakes, and expired movements, preserving the inclusive filter, sources, CSV columns, and sorting. Daily closing/cash reconciliation is out of scope for version 1.0 (10.2.4). — **Planned**
- **12.4.18 Pareto** — Query revenue by item or service for up to 31 days and show each item's share of total revenue using net line revenue after line discount. — **Planned**
- **12.4.19 Forecast** — Query sales quantities and current stock to estimate daily demand and coverage with a default 30-day window, 92-day maximum, active-item filter; services excluded. — **Planned**
- **12.4.20 Barang minus** — Show items with negative stock as a read-only monitoring list from canonical production stock data. — **Planned**
- **12.4.21 Sync indicator** — Show queue status, last sync, pending operations, and conflicts; only Worker-confirmed changes are final. — **Implemented** for the Barang slice

### 12.5 Backend-wide requirements

- **12.5.1** Cloudflare D1 is the authoritative production source of truth; IndexedDB stores device-local cache and pending operations, not confirmed shared records.
- **12.5.2** Every read and mutation is validated by the API, and every protected mutation checks the staff session and role on the server.
- **12.5.3** Stock-affecting actions update the source document, stock balance/ledger, and audit record atomically so a partial failure cannot leave totals inconsistent.
- **12.5.4** The server calculates financial totals from validated line data and never trusts totals sent by the browser.
- **12.5.5** Mutations record the acting staff member and timestamp; corrections, voids, payment changes, and deletions remain traceable.
- **12.5.6** API errors are explicit and actionable; failed writes never appear successful or leave duplicate transactions.
- **12.5.7** Acceptance tests cover valid and invalid inputs, permission rejection, persistence after reload, and resulting stock and financial totals.
- **12.5.8** Every queued operation has a stable idempotency key and device/user attribution; retries never create duplicate financial or stock mutations.
- **12.5.9** Offline changes stay visibly pending until the Worker confirms the D1 commit; conflicts and rejected operations are retained, explained, and recoverable without silent overwrite.
- **12.5.10** The UI warns when data is stale or unsynchronized; offline use on one device does not provide real-time updates to another disconnected device.
- **12.5.11** On reconnection the server revalidates permissions and business rules, detects stale stocktake inputs, and detects conflicting edits to shared records.
- **12.5.12** Preserve prototype permissions: admins manage staff and pharmacy profile, unlock sales, cancel paid-invoice status, and edit/delete stocktake movements; active staff may perform the other prototype-enabled operations.
- **12.5.13** Data-table and storage documentation follows [TABLE.md](TABLE.md).
- **12.5.14** A patient name is optional on a sale, stored permanently with that transaction, never shown on a public or unauthenticated response, and included in encrypted exports and database backups.

### 12.6 Client-confirmed backend rules

- **12.6.1** All active staff may create sales; only admins may unlock locked sales.
- **12.6.2** Sales must be paid in full; the API rejects underpayment rather than recording a remaining balance.
- **12.6.3** Stock increases when goods are received and the supplier invoice is saved, regardless of whether the invoice has been paid.
- **12.6.4** Supplier invoices are paid in full or remain unpaid; partial payments are not supported.
- **12.6.5** Supplier invoice numbers need not be unique per distributor; the server must not reject a repeated number for that reason alone.
- **12.6.6** Cash payments may exceed the sale total; the system records the amount tendered and calculates change.
- **12.6.7** Sales support a discount per line and an additional discount for the whole sale; all active staff may apply discounts with no separate cap beyond keeping the final amount non-negative.
- **12.6.8** A line or sale discount cannot reduce its final amount below Rp0; the API rejects excessive discounts.
- **12.6.9** Each sale uses one payment method; split tender is not supported.
- **12.6.10** Negative stock is allowed.
- **12.6.11** Barang minus is a read-only monitoring list; negative balances are resolved through goods receipt or stock opname.
- **12.6.12** Customer sales returns and refunds are outside version 1.0.
- **12.6.13** Every received item must record a batch and expiry date.
- **12.6.14** Stock has one aggregate balance per item, not per batch; batch and expiry are receipt metadata; sales may optionally record a batch but do not allocate stock by batch.
- **12.6.15** Purchase discounts apply to the purchase price before percentage tax; package cost converts to unit cost by dividing by units per package; suggested sale price is unit cost plus the entered margin, rounded up, with manual override allowed.
- **12.6.16** A supplier return recorded from the Expired workflow reduces stock only; it creates no supplier credit and reduces no invoice balance.
- **12.6.17** Damaged goods use the same Expired workflow with the same disposal or supplier-return actions.
- **12.6.18** Each item may be stock-counted once per calendar month.
- **12.6.19** Any active staff member may perform and save a stock count; no separate admin approval is required.
- **12.6.20** If system stock changes while an opname is open, reject the stale count and require the staff member to reopen the item and recount.

---

## 13. Definition of "ready for version 1.0"

- **13.1** Staff can log in with their own accounts and the server enforces permission rules.
- **13.2** The database stores stock, sales, invoices, stock movements, supplier data, and staff data reliably.
- **13.3** Core pharmacy workflows can be completed end-to-end without prototype-only data.
- **13.4** The app produces correct totals, stock deductions, and reports from the database.
- **13.5** Data can be restored from backup without data loss or corruption.
- **13.6** Multiple staff and devices use the shared D1-backed app; after initial load, all approved workflows can be recorded offline and stay pending until confirmed by the Worker.
- **13.7** Tests prove that retries are idempotent, stale or conflicting changes are not silently applied, and pending work survives reloads.
- **13.8** The D1 backup/restore process has been tested by the team responsible for operations (daily close is out of scope per 10.2.4).
- **13.9** The client has accepted the app in a live or near-live validation session.

---

## 14. Risks and mitigation

- **14.1** Prototype assumptions treated as production logic → move all real logic into the API and database. Mitigation is the rule; violation causes security and data mismatch.
- **14.2** Stock and cash data drifting from reality → database-backed validation, reports, and reconciliation.
- **14.3** Internet outage or isolated devices → clear pending/stale indicators, idempotent sync, server revalidation, conflict queues, and tested recovery procedures.
- **14.4** Device loss or browser storage deletion before sync → warn against clearing site data, show unsynced work prominently, and agree an operational recovery policy (10.1.9).
- **14.5** Cloud service or account failure → D1 backup/export, restore checks, and documented access. 
- **14.6** D1 free daily row limits are hard-enforced → index every filtered column, page large lists, avoid full-table reads per request, keep batches small, monitor usage, and take nightly exports so a bad day is recoverable. At the volume confirmed in 10.2.8 (more than 150 sales per day) this is a live risk, not a theoretical one: review D1 row-read and row-write usage weekly and be ready to move to the paid plan before a busy day exhausts the daily allowance.
- **14.7** Scope drift during UI exploration → keep each phase tightly scoped and client-approved.
- **14.8** Too much complexity added before v1.0 → keep v1.0 to one pharmacy while supporting multi-user/multi-device access and bounded offline synchronization.
- **14.9** Undecided operational items (10.2.1–10.2.8) stalling implementation → resolve each before the phase that depends on it, as recorded in 10.2.

---

## 15. Out of scope for version 1.0

- **15.1** Multi-branch consolidation.
- **15.2** Central purchasing across locations.
- **15.3** Advanced accounting integration or tax automation.
- **15.4** Supplier ordering automation via external systems.
- **15.5** Customer sales returns and refunds.
- **15.6** Mobile app publishing or separate native app delivery.
- **15.7** Daily close and cash reconciliation, including cash-drawer counting and variance recording (client decision, 10.2.4): the pharmacy closes cash outside the app.

---

## 16. Progress summary

| Phase | Progress |
|---|---|
| 1. Product definition and delivery gates | 25% |
| 2. Backend feature rules and data model | 25% |
| 3. Application foundation and access control | 100% |
| 4. Master data, purchasing, and sales | 25% |
| 5. Inventory control and expiry | 0% |
| 6. Reports and operational visibility | 0% |
| 7. Reliability and backup readiness | 25% |
| 8. Quality hardening and acceptance testing | 0% |
| 9. Deployment, training, and handover | 25% |
| **Production application implementation** | **25%** |

### 16.1 Notes on the summary

- **16.1.1** Phase 1 stays at 25% until the full acceptance checklist exists (1.2.2, 1.3.1).
- **16.1.2** Phase 2 stays at 25% until the other 10 menus have approved backend rules (2.10.1).
- **16.1.3** Phase 3 is 100%: foundation, database, authentication (password), authorization, audit limits, tests, and the Barang screen are complete and verified.
- **16.1.4** Phase 7 is 25% because local backup and offline sync work but cloud restore and two-device testing are pending.
- **16.1.5** Phase 9 is 25% because a trial deployment exists but the agreed domain, data onboarding, training, and handover do not.
- **16.1.6** The verified facts behind these values are listed in 12.1; B15, B16, and B17 are approved and recorded in 10.1.17–10.1.19.
- **16.1.7** Every item in 10.1 and 10.2 now has a recorded answer, including 10.2.15 (single-admin password recovery), which the client approved on 3 November 2026. One item, 10.2.1, stays **Partly answered** until the client explicitly confirms that the installation belongs to their own Cloudflare account; the trial already runs there. The rest of the remaining work is implementation.
- **16.1.8** Phase 4 is 25% because all reference lists and the pharmacy profile are implemented while purchasing, sales, and the Jasa screen are not.
