# Summit Calendar Tracking

## Project Overview
Calendar tracking webapp for executives at Summit Auto Body Industry (Thai company).
Cloudflare Workers + D1 (SQLite) + single-page HTML frontend + Telegram Bot notifications.

## Quick Commands
```bash
# Dev environment (Windows)
conda activate calendar
cd C:\Users\vee\Desktop\P_Tai_Project\Calendar

npm run dev          # Local dev server → http://localhost:8787
npm run deploy       # Deploy to Cloudflare production

# Database migration (when schema changes)
npx wrangler d1 execute summit-calendar-db --remote --file=./migration_xxx.sql
```

## Project Structure
```
src/worker.js        ← Backend: all API routes, auth, cron, Telegram (~1100 lines)
src/pins.js          ← User PIN list (edit to add/remove viewers)
public/index.html    ← Frontend: entire UI in one file (~6000 lines)
public/sw.js         ← PWA Service Worker
public/manifest.json ← PWA manifest
schema.sql           ← Full DB schema (fresh install)
migration_*.sql      ← Incremental DB migrations
wrangler.toml        ← Cloudflare config (D1, env vars, cron)
```

## Architecture
- Backend: Cloudflare Worker serving API at `/api/*` and static files via Assets binding
- Database: Cloudflare D1 with 5 tables (events, notifications_log, settings, audit_log, holidays)
- Auth: Custom JWT — Admin login (user/pass) + Viewer login (4-digit PIN from pins.js)
- Notifications: Telegram Bot, cron every 1 min checks events starting in ~15 min
- Notification routing: Admin always receives + event creator + shared_with users

## Users
- Admin: username `admin` (Telegram chat 8549681576 — always receives all notifications)
- Viewers defined in `src/pins.js`: Nopamas(1111), Jatuporn(2222), Warunee(3333), JV_Team(1122), BD_Team(2211)

## Key Conventions
- All times stored as ISO 8601 in UTC, displayed in Asia/Bangkok timezone
- `owner_id`: 'shared' = visible to everyone, or a user ID for personal events
- `shared_with`: comma-separated user IDs for cross-notification (e.g. 'nopamas,jatuporn')
- When adding a DB column: create migration_xxx.sql + update schema.sql + update worker.js + update index.html
- Frontend is one monolithic HTML file — use grep to find sections, don't read the whole file

## Security Notes
- wrangler.toml contains secrets in plaintext (Telegram token, JWT secret) — for production use `wrangler secret put`
- Default admin password is 'admin' — should be changed
- Repo is Private on GitHub: https://github.com/Vee198/Summit_Calendar

## Known Issues
- README-DEPLOY.md has outdated PIN values (not matching pins.js)
- AI secretary feature ("คุณต่าย") is referenced in README but not implemented
- Telegram token in promp.txt differs from wrangler.toml — wrangler.toml is the active one
