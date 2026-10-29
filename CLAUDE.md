# Project: Club Sky Park (hotel website + PMS)

## What this product does
Public hotel website (frontend/) with room booking and enquiry forms, plus a staff PMS/POS
(admin.html + /api routes) for bookings, check-in/out, housekeeping, restaurant, billing, reports.
Single hotel (no multi-tenancy). Owner: Naitik (non-technical, prefers copy-paste-ready work, Hinglish).

## Stack (do not change without asking)
- Frontend: plain HTML/CSS/JS in `frontend/`, served by Express static
- Backend: Node.js + Express in `backend/src` (server.js, app.js, routes.js, db.js, middleware.js, permissions.js)
- Database: JSON file (`backend/data/club-skypark.json`, override with `DATA_FILE`), custom `store` in db.js
- Auth: JWT (jsonwebtoken) + bcryptjs, role + permission checks in permissions.js
- Validation: zod
- Everything runs on localhost. Do NOT deploy unless the owner explicitly asks.

## Rules
- Never commit secrets. All secrets in env vars, documented in `backend/.env.example`.
- Every new API endpoint needs: input validation, auth check, permission check, tests.
- Server is the source of truth: prices, permissions, limits are enforced on the backend only.
- Anything typed by a public visitor is untrusted: sanitise on the server, escape when rendering in admin.
- Public website must never show exact room counts, only Available / Sold Out.
- Run `npm test` (in backend/) before saying a task is done.
- Never edit a test just to make it pass. Fix the code.
- Ask before adding a new dependency. Prefer small, reviewable changes. One concern per commit.
- Stick strictly to the scope the owner asked for. Do not add extra features or files.

## Commands (run inside backend/)
- Dev: `npm run dev`
- Start: `npm start`
- Test: `npm test`
- Backup data: `npm run backup`
- Restore check: `npm run restore -- <backup-file> <target-file>`

## Architecture decisions
See `docs/decisions/` for the log. Security findings: `docs/audit.md`.
