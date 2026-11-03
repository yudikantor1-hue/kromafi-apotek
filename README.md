# Kromafi Apotek

Custom pharmacy application built for one pharmacy, designed to be installed by other pharmacies as their own separate installation (own Cloudflare account, own Worker, own database, own data).

## Current state and handoff

A new session should be able to continue from this section alone.

- **What exists.** `app/` is a working production slice for one screen, Barang: sign-in (password, one-time PIN, and offline sign-in), staff administration, item list/search/create/edit/deactivate, a durable offline outbox, idempotent sync with conflict history, and an encrypted export/import package. `UI/` remains the approved prototype for the other 17 menus; those menus are listed in the app but disabled.
- **What is live.** The app is deployed to the client's own Cloudflare account at https://kromafi-apotek.kromafi.workers.dev (Worker `kromafi-apotek`, D1 `kromafi-apotek`, id `db477559-d51d-40f3-a822-d1cb2c21904e`). Migrations `0001`–`0005` are applied there. It is a trial deployment, not a production launch: the custom domain, a second admin, and data onboarding are still open.
- **Checks before finishing any change.** From `app/`: `npm run typecheck`, `npm test`, and `npm run build`. All three must pass; the suites currently hold 59 tests.
- **Deploying.** From `app/`, apply new migrations with `npx wrangler d1 migrations apply kromafi-apotek --remote`, then `npx wrangler deploy`. Afterwards verify the live Worker: `/api/health` returns `200` and a protected route returns `401` without a session.
- **Where the rules live.** Every decision question and its recorded answer is in [PLAN.md](PLAN.md) phase 10; keep new answers there and never in the conversation alone. Tables and device storage are in [TABLE.md](TABLE.md). Application behaviour, local setup, and known gaps are in [app/README.md](app/README.md).
- **Recent work (3 November 2026).** The Petugas screen shows a staff member only their own account, without a notice explaining it (10.2.11). Offline work is judged by the account that recorded it: work recorded after that account's deactivation is cancelled even when an active account sends the queue (10.2.12), and the device drops that work silently, leaving only the server ledger (10.2.13). An admin resets another account's password only while it is Aktif, and the reset ends that account's sessions (10.2.14). Recovering a forgotten password on a single-admin installation is still open, with a three-step recommendation recorded as 10.2.15.
- **Conventions.** Speak to the client in Indonesian; keep project files, code, and documentation in English; staff-facing text inside the app stays Indonesian. Do not edit `UI/index.html` by hand — it is generated from `UI/src` by `UI/build.mjs`. Never write passwords, tokens, or session secrets into files, logs, or chat.

## Roles

### The client — you

You are the client and the owner of the vision: an application imagined around your needs, goals, and workflows. You decide what the application must do, approve the expected outcome and the todo list before work starts, and make the business decisions along the way. You are the only person who knows the production passwords.

### The developer — the AI

The AI is your bespoke application development partner. It helps you clarify the vision, translates it into an approved plan, then designs, builds, tests, and validates the application so it becomes a real product you can use. It collaborates with you at decision points, asks when an important requirement is unclear, explains technical terms in plain language, and does not begin execution until you have approved the expected outcomes and todo list. It speaks to you in Indonesian and keeps project files in English.

## Contacting the client

The client may step away from the computer while the AI is working. To call them back, run this in a terminal from this project folder:

```
py ai_telegram.py
```

The script sends a predefined Telegram message to the client's chat. It reads the bot token from the `TELEGRAM_BOT_TOKEN` environment variable, so that variable must be configured for the Windows user first. The rules for using the script, and what to check before running it, are in [RULES.md](RULES.md).

## Project contents

Every folder and file in the project root, with a short description. Update this inventory whenever the project contents change.

| Path | Description |
|---|---|
| [README.md](README.md) | This file: the two roles, how to contact the client, and the project contents inventory. |
| [RULES.md](RULES.md) | Project rules: language, documentation standards, the client communication workflow, how to contact the client, and how to use `PLAN.md`. |
| [PLAN.md](PLAN.md) | Delivery plan: verified current state, target outcome and architecture for version 1.0, phased work, open decisions, risks, and the progress scale. |
| [PRD.md](PRD.md) | Product requirements for the first usable version: user needs, business goals, scope, and acceptance criteria. |
| [DESIGN.md](DESIGN.md) | System design and technical architecture: the app, the API, the database, and the core workflows. |
| [TABLE.md](TABLE.md) | Inventory and documentation format for every data table and storage area. |
| [ai_telegram.py](ai_telegram.py) | Sends the predefined Telegram message that calls the client back to the computer. The chat id is set inside the file; the bot token comes from `TELEGRAM_BOT_TOKEN`. |
| [UI/](UI) | Client-approved UI prototype and workflow baseline for all 18 menus. Not the production application. See [UI/README.md](UI/README.md). |
| [app/](app) | Production application: React/Vite PWA, Cloudflare Worker API, and D1 migrations. Currently covers the Barang slice. See [app/README.md](app/README.md). |
| [.freebuff/](.freebuff) | Workspace metadata for the AI tool (project id and its own ignore file). Nothing here belongs to the application. |
| [.cloud-attachments/](.cloud-attachments) | Attachments imported with this conversation, kept as a reference archive. |

### `UI/` — approved prototype

| Path | Description |
|---|---|
| [UI/build.mjs](UI/build.mjs) | Build script that joins the split sources into one standalone `index.html`; supports `--watch` and `--check`. No dependencies. |
| [UI/index.html](UI/index.html) | Generated prototype output opened for review. Do not edit by hand; rebuild it. |
| [UI/referensi_ui.html](UI/referensi_ui.html) | Original single-file prototype, kept read-only as a backup reference. |
| [UI/src/index.html](UI/src/index.html) | Page shell: head, login screen, sidebar, header, and the `<main>` wrapper, with include markers for each page. |
| [UI/src/css/app.css](UI/src/css/app.css) | Prototype styles; the Tailwind configuration stays in `src/index.html`. |
| [UI/src/pages/](UI/src/pages) | Markup per menu (18 pages) plus `_header-actions.html` for the per-page header buttons. |
| [UI/src/js/app.js](UI/src/js/app.js) | Root Alpine component: login, header, and the sync button. |
| [UI/src/js/core/store.js](UI/src/js/core/store.js) | Shared helpers: sync queue, default staff and distributor lists. |
| [UI/src/js/components/](UI/src/js/components) | Reusable date picker and month picker components. |
| [UI/src/js/pages/](UI/src/js/pages) | Logic per menu (18 files), one per page. |

### `app/` — production application

| Path | Description |
|---|---|
| [app/README.md](app/README.md) | What the production application does, local setup, checks, deployment checklist, backup and restore, and known gaps. |
| [app/index.html](app/index.html) | Vite entry HTML for the PWA. |
| [app/package.json](app/package.json) | Scripts (`dev`, `dev:api`, `dev:cf`, `build`, `test`, `typecheck`, database and bootstrap tasks) and dependencies. |
| [app/package-lock.json](app/package-lock.json) | Locked dependency versions. Keep it in sync; do not hand-edit. |
| [app/tsconfig.json](app/tsconfig.json) | TypeScript configuration. |
| [app/vite.config.ts](app/vite.config.ts) | Vite configuration, including the `/api` proxy to the local API server. |
| [app/wrangler.jsonc](app/wrangler.jsonc) | Cloudflare Worker, D1 database id, and static asset configuration. |
| [app/skills-lock.json](app/skills-lock.json) | Lock file recording which bundled agent skill references were installed. |
| [app/.gitignore](app/.gitignore) | Keeps dependencies, build output, and the local database out of version control. |
| [app/.agents/skills/](app/.agents/skills) | Bundled reference documentation for Cloudflare Workers, D1, Wrangler, and related tooling, used while developing. Reference only, not application code. |
| [app/src/main.tsx](app/src/main.tsx) | React entry point that mounts the application. |
| [app/src/App.tsx](app/src/App.tsx) | Session, device setup, sync orchestration, and the Barang actions that the screens call. |
| [app/src/types.ts](app/src/types.ts) | Shared TypeScript types for items, staff, sessions, and API results. |
| [app/src/styles.css](app/src/styles.css) | Brand stylesheet for the whole application: layout, drawer, table, forms, and responsive rules. |
| [app/src/vite-env.d.ts](app/src/vite-env.d.ts) | Vite type declarations. |
| [app/src/components/](app/src/components) | Screens and UI parts: `LoginPage`, `SetupPage`, `Shell` (drawer and header), `BarangPage`, `PetugasPage`, `ExportModal`, and `Icons` (the icon set). |
| [app/src/lib/api.ts](app/src/lib/api.ts) | Typed client for the Worker API. |
| [app/src/lib/idb.ts](app/src/lib/idb.ts) | IndexedDB storage for metadata, items, the outbox, and local credentials. |
| [app/src/lib/offlineAuth.ts](app/src/lib/offlineAuth.ts) | Device-side PBKDF2 credential creation and verification for offline sign-in. |
| [app/src/lib/sync.ts](app/src/lib/sync.ts) | Pending overlay, queueing, push, and snapshot refresh against the server. |
| [app/src/lib/exportImport.ts](app/src/lib/exportImport.ts) | Versioned, AES-GCM-encrypted Barang export and import package. |
| [app/src/lib/format.ts](app/src/lib/format.ts) | Formatting helpers for dates, numbers, and currency. |
| [app/public/sw.js](app/public/sw.js) | Service worker that caches the app shell so the app opens without internet. |
| [app/public/manifest.webmanifest](app/public/manifest.webmanifest) | PWA manifest: name, icons, and display mode. |
| [app/public/icon.svg](app/public/icon.svg) | Application icon. |
| [app/worker/src/index.ts](app/worker/src/index.ts) | Worker entry point: routing, static assets, and error handling. |
| [app/worker/src/auth.ts](app/worker/src/auth.ts) | Sign-in, sessions, lockout, and session checks. |
| [app/worker/src/password.ts](app/worker/src/password.ts) | PBKDF2 password hashing and verification. |
| [app/worker/src/username.ts](app/worker/src/username.ts) | Username validation and normalisation. |
| [app/worker/src/permissions.ts](app/worker/src/permissions.ts) | Role matrix between staff and admin, enforced on the server. |
| [app/worker/src/items.ts](app/worker/src/items.ts) | Barang read and write endpoints. |
| [app/worker/src/sync.ts](app/worker/src/sync.ts) | Idempotent operation push, conflict rules, and snapshot responses. |
| [app/worker/src/staff.ts](app/worker/src/staff.ts) | Staff administration endpoints: create, edit, activate, reset a password, audit history. |
| [app/worker/src/recovery.ts](app/worker/src/recovery.ts) | One-time recovery codes used for password reset without email. |
| [app/worker/src/http.ts](app/worker/src/http.ts) | Request helpers: JSON responses, origin checks, cookies, and error shapes. |
| [app/worker/src/env.ts](app/worker/src/env.ts) | Worker bindings and environment typing. |
| [app/worker/migrations/](app/worker/migrations) | D1 schema migrations, applied in order: `0001_init.sql`, `0002_recovery_codes.sql`, `0003_username.sql`, `0004_account_pin.sql`, `0005_operation_author.sql`. |
| [app/worker/seed/dev.sql](app/worker/seed/dev.sql) | Local development accounts only. Never run against the deployed database. |
| [app/scripts/bootstrap-admin.mjs](app/scripts/bootstrap-admin.mjs) | Creates or resets the first admin from a password typed at the terminal; the password is never written to a file. |
| [app/scripts/dev-api.mjs](app/scripts/dev-api.mjs) | Local fallback server that runs the same Worker handler and migrations on Node when `workerd` is unavailable. |
| [app/tests/worker.test.ts](app/tests/worker.test.ts) | Tests for the Worker request handler against the real migration SQL. |
| [app/tests/offline.test.ts](app/tests/offline.test.ts) | Tests for offline logic, sync queueing, and encryption against a fake IndexedDB. |
| [app/tests/helpers/testDatabase.ts](app/tests/helpers/testDatabase.ts) | Shared test helper that builds a migrated test database. |
| [app/dist/](app/dist) | Generated production build output. Never edit; it is recreated by `npm run build`. |
| [app/.wrangler/](app/.wrangler) | Local development state: the local D1 database files and logs. Not part of the application. |
