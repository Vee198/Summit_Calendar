---
name: summit-calendar
description: >
  Project skill for Summit Calendar Tracking — a Cloudflare Workers webapp for
  executive schedule management at Summit Auto Body Industry. Use this skill
  whenever working on any file in this project: editing worker.js, index.html,
  pins.js, schema.sql, wrangler.toml, or any migration/deployment task.
  Also use when the user mentions Summit Calendar, calendar tracking,
  adding users, fixing notifications, deploying to Cloudflare, editing the
  calendar UI, or anything related to this project's codebase.
---

# Summit Calendar Tracking — Project Skill

## What This Project Is

A calendar tracking webapp for executives at **Summit Auto Body Industry** (Thai company).
Admin creates and manages events; executives view their schedules via PIN login.
Notifications go out 15 minutes before events via Telegram Bot.

The entire app runs on Cloudflare's free tier: Workers for the backend API, D1 (SQLite)
for the database, and static asset hosting for the frontend.

## Tech Stack

| Layer       | Technology                          | Key File(s)                    |
|-------------|-------------------------------------|--------------------------------|
| Backend API | Cloudflare Workers (JS)             | `src/worker.js` (~1100 lines)  |
| Database    | Cloudflare D1 (SQLite)              | `schema.sql`, `migration_*.sql`|
| Frontend    | Single-page HTML + vanilla JS + CSS | `public/index.html` (~6000 lines) |
| PWA         | Service Worker + manifest           | `public/sw.js`, `public/manifest.json` |
| Auth        | Custom JWT (2-level: Admin + PIN)   | `src/worker.js`, `src/pins.js` |
| Notifications | Telegram Bot API                  | `src/worker.js` (sendTelegram) |
| Config      | Wrangler                            | `wrangler.toml`                |
| Mobile App  | Capacitor 8 (wraps `public/`)       | `capacitor.config.json`, `MOBILE_BUILD_GUIDE.md` |

## Architecture Overview

```
Browser (index.html)
  │
  ├── PIN Login ──→ /api/auth/pin   ──→ pins.js lookup ──→ JWT (role:viewer)
  ├── Admin Login ─→ /api/auth/login ──→ env vars check ──→ JWT (role:admin)
  │
  ├── CRUD ────────→ /api/events     ──→ D1 Database
  ├── Holidays ───→ /api/holidays    ──→ D1 Database
  ├── Audit ──────→ /api/audit-log   ──→ D1 Database
  ├── Profile Pic ─→ /api/profile/*  ──→ D1 (base64 storage)
  ├── AI Chat ────→ /api/ai/chat     ──→ (placeholder, not yet implemented)
  │
  └── Telegram Bot Webhook ──→ /api/telegram/webhook
                                  Commands: /start, /test, /mychatid, /status

Cron (every 1 min) ──→ checkReminders()
  → SELECT events WHERE reminder_sent=0 AND start BETWEEN now+14m AND now+16m
  → resolveNotifyChatIds(owner_id, shared_with) → includes Admin + creator + shared users
  → sendTelegram() → log to notifications_log → SET reminder_sent=1
```

## Database Schema (5 tables)

- **events** — Calendar events with title, time, category, priority, status, `owner_id` (multi-user), `shared_with` (comma-separated user IDs for shared notifications)
- **notifications_log** — Records of sent Telegram notifications
- **settings** — Key-value app settings (reminder_minutes, company_name, etc.)
- **audit_log** — Tracks create/update/delete actions on events with old/new data snapshots
- **holidays** — Thai public holidays (bank holidays, 2025-2026)

When adding new columns, create a `migration_xxx.sql` file AND update `schema.sql` (for fresh installs).

## Users & Authentication

Two-level auth system:

**Admin** (full access):
- Username: `admin`, Password: from `env.ADMIN_PASS`
- Telegram Chat ID: `8549681576` (hardcoded in resolveNotifyChatIds as always-receive)

**Viewers** (PIN login, read-only calendar + own profile):
Defined in `src/pins.js`:

| Name          | PIN    | ID        | Telegram Chat ID |
|---------------|--------|-----------|------------------|
| คุณ Nopamas   | `1111` | nopamas   | 8766352693       |
| คุณ Jatuporn  | `2222` | jatuporn  | 8708044010       |
| คุณ Warunee   | `3333` | warunee   | 8725116507       |
| JV Team       | `1122` | jv_team   | (not yet set)    |
| BD Team       | `2211` | bd_team   | (not yet set)    |

To add a new user: edit `src/pins.js` → add entry → `npm run deploy`.

## API Routes Reference

All API routes are in `src/worker.js` inside `handleRequest()`:

**Auth:** POST `/api/auth/login`, POST `/api/auth/pin`, GET `/api/auth/verify`
**Users:** GET `/api/users`
**Events:** GET/POST `/api/events`, POST `/api/events/check-overlap`
**Audit:** GET `/api/audit-log`
**Holidays:** GET/POST `/api/holidays`, POST `/api/holidays/init`
**Telegram:** POST `/api/telegram/test`, POST `/api/telegram/setup-webhook`, POST `/api/telegram/webhook`
**Reminders:** POST `/api/reminders/check`
**Notifications:** GET `/api/notifications`
**Profile:** GET/POST `/api/profile/picture`, GET `/api/profile/pictures`
**Settings:** GET/PUT `/api/settings`
**Stats:** GET `/api/stats`
**AI:** GET `/api/ai/status`, POST `/api/ai/chat` (placeholder)

## Key Files Quick Reference

```
Calendar/
├── src/
│   ├── worker.js              ← All backend logic (API, auth, cron, Telegram)
│   └── pins.js                ← Viewer PIN list (edit to add/remove users)
├── public/
│   ├── index.html             ← Entire frontend (HTML + CSS + JS in one file)
│   ├── manifest.json          ← PWA manifest
│   ├── sw.js                  ← Service Worker (cache strategy)
│   ├── icons/                 ← PWA icons (192px, 512px)
│   └── avatars/               ← SVG avatar files
├── schema.sql                 ← Full DB schema (for fresh install)
├── migration_owner.sql        ← Adds owner_id column (multi-user)
├── migration_audit_log.sql    ← Adds audit_log table
├── migration_holidays.sql     ← Adds holidays table
├── migration_shared_with.sql  ← Adds shared_with column
├── wrangler.toml              ← Cloudflare config (D1 binding, env vars, cron)
├── package.json               ← npm scripts (dev, deploy, db:init)
├── run_dev.bat                ← Windows dev server launcher
├── .gitignore                 ← Git ignore rules
└── README-DEPLOY.md           ← Deployment guide (may be slightly outdated)
```

## Development & Deployment

**Local dev environment** (Windows):
```
conda activate calendar
cd C:\Users\vee\Desktop\P_Tai_Project\Calendar
npm run dev          # → http://localhost:8787
```

**Deploy to production:**
```
conda activate calendar
cd C:\Users\vee\Desktop\P_Tai_Project\Calendar
npm run deploy       # → https://summit-calendar.xxx.workers.dev
```

**Run a migration** (when DB schema changes):
```
npx wrangler d1 execute summit-calendar-db --remote --file=./migration_xxx.sql
npm run deploy
```

**Add/remove users:** Edit `src/pins.js` → deploy.

**Change secrets securely:** Use `npx wrangler secret put SECRET_NAME` instead of editing wrangler.toml.

## Common Tasks — How To

### Add a new viewer user
1. Edit `src/pins.js` — add `{ pin: 'XXXX', id: 'name', name: 'Display Name', active: true, telegram_chat_id: 'CHAT_ID' }`
2. Deploy: `npm run deploy`

### Add a new DB column to events
1. Create `migration_xxx.sql` with `ALTER TABLE events ADD COLUMN ...`
2. Update `schema.sql` to include the new column (for fresh installs)
3. Update `worker.js` — add the column to INSERT/UPDATE queries
4. Update `index.html` — add UI for the new field
5. Run migration: `npx wrangler d1 execute summit-calendar-db --remote --file=./migration_xxx.sql`
6. Deploy: `npm run deploy`

### Change notification logic
All in `src/worker.js`:
- `checkReminders()` (line ~107) — cron handler, checks upcoming events
- `resolveNotifyChatIds()` (line ~82) — maps owner_id + shared_with to Telegram Chat IDs
- `sendTelegram()` (line ~67) — sends to multiple chat IDs

### Edit the frontend UI
Everything is in `public/index.html` — one monolithic file with HTML, CSS, and JS.
The CSS variables are at the top (`:root { ... }`). The login screen starts around line 2118.
The main app starts around line 2170.

## Mobile App (Capacitor)

The web frontend (`public/`) is packaged as native **Android + iOS** apps via Capacitor 8.
The Cloudflare backend is unchanged; the app calls the same API over HTTPS.

- **API base detection** (`public/index.html`): auto-detects native via
  `window.Capacitor.isNativePlatform()`. On native it uses `PROD_API_BASE`
  (production Cloudflare URL); on web it uses `''` (same-origin).
- ⚠️ If the production URL changes, edit the single `PROD_API_BASE` line in
  `index.html`, then run `npx cap sync`.
- **CORS** is already `*` in `worker.js`, so the app's cross-origin API calls work.
- **App ID:** `com.summitautobody.calendar` · **App Name:** `Summit Calendar`.
- **First-time setup:** `npm install` -> `npx cap add android` / `npx cap add ios`
  (iOS requires a Mac) -> `npx cap sync`.
- **Update flow after editing web code:** `npm run deploy` -> `npx cap sync`
  -> rebuild in Android Studio / Xcode.
- Full step-by-step: see `MOBILE_BUILD_GUIDE.md` (Thai).

### In-webapp "Install App" button

The webapp offers install buttons on the **login screen** and in the **sidebar menu**
(both call `pwaInstallApp()`), so users can install without finding browser menus.

- Reuses the existing PWA install system: `pwaInstallApp()` in `public/index.html` (~line 5999).
- **Android / Desktop Chrome:** native install prompt (`beforeinstallprompt`).
  **iOS:** shows an "Add to Home Screen" guide modal (`#pwaIosModal`).
  **Other / no prompt:** shows a generic guide modal (`#pwaGenericModal`).
- **Store links** `PLAY_STORE_URL` / `APP_STORE_URL` (in `index.html`, ~line 5950) are empty by default.
  After publishing to Play Store / App Store, paste the links there — the button then routes
  users to the correct store automatically per platform (no other code changes needed).

## Backup & Restore

- **Local snapshots:** `_backups/Summit_Calendar_BACKUP_YYYY-MM-DD.zip` (gitignored, not pushed).
- **Git tag** `stable-backup-2026-06-06` marks the last known-good state before mobile work.
- **GitHub `origin/main`** is a remote backup of all pushed commits.
- **Restore options:** unzip a snapshot, OR `git checkout <tag>`, OR `git reset --hard origin/main`.
- Prefer doing new work on a feature branch so `main` stays stable.

## Known Issues & Gotchas

- `wrangler.toml` contains secrets in plaintext (TELEGRAM_BOT_TOKEN, JWT_SECRET, ADMIN_PASS). For production, use `wrangler secret put` and remove from toml.
- `README-DEPLOY.md` has outdated PIN values (says 1234/5678/9012 but actual PINs are in pins.js).
- The AI secretary feature ("คุณต่าย") is referenced in README-DEPLOY.md and has API routes (`/api/ai/chat`, `/api/ai/status`) but is not fully implemented — no API key is configured.
- `index.html` is ~6000 lines. When editing, use grep to find specific sections rather than reading the whole file.
- The Telegram Bot token in `promp.txt` differs from the one in `wrangler.toml` — the wrangler.toml version is the active one.
