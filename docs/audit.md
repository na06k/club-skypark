# Security & Reliability Audit — Club Sky Park

Scope: backend (`backend/src`), public booking/enquiry flow, admin panel rendering, git hygiene.
Date: 2026-10-29. Status column: FIXED = fixed on branch `hardening/playbook`, TODO = left for later.

**Important reality check:** this repo has a JSON-file database and *cash/pay-at-hotel* bookings only.
There is NO SQLite and NO Razorpay code in this repo, so Razorpay signature/webhook checks and SQL
indexes do not apply here (they will matter when the payment code is merged in).

| # | Area | File : line | Problem | Severity | Status |
|---|------|-------------|---------|----------|--------|
| 1 | Pricing | routes.js:526-555, room-booking.html:237 | Public booking trusts `total_price` sent by the browser. Anyone can book a suite for Rs 0. Also no date validation (check-out before check-in, past dates). | High | FIXED |
| 2 | XSS | admin JS (bookings, dashboard, management, ...) | Guest name / enquiry text typed on the public site is put into admin pages via `innerHTML` with no escaping. A visitor can run script in the receptionist's browser and steal the admin token. | High | FIXED (server sanitises public input + admin renderers escape) |
| 3 | Privilege escalation | routes.js:1842-1892 | Anyone with `staff.create` / `staff.edit` can create a `super_admin` or change a super admin's email/password (account takeover). Last super admin can be demoted. | High | FIXED |
| 4 | Session revocation | middleware.js:24-30 | If a staff member is deleted/missing, the token's own claims are still trusted until it expires (12h). | High | FIXED |
| 5 | Secrets/defaults | middleware.js:5-11, db.js:92-93, .env.example | Falls back to a known JWT secret and default admin password `admin123`. Anyone can forge a super_admin token if deployed without a .env. | High | FIXED (refuses to start in production with weak secret; warns in dev) |
| 6 | Abuse | server.js, routes.js:526,568 | No rate limit on public booking / enquiry. Booking triggers a WhatsApp message to any number typed by the visitor (spam + cost). | High | FIXED |
| 7 | Data leak | routes.js:518-524 | `/public/rooms` returns every room (numbers, live status) and writes to the DB on each anonymous hit. Breaks the "never show room counts" rule. | Medium | FIXED (category-level Available / Sold Out only, read-only) |
| 8 | Uploads | routes.js:1346-1363 | Guest documents: no MIME allow-list, no size cap, filename injected into `Content-Disposition` header. | Medium | FIXED |
| 9 | Body size | server.js:30 | 20 MB JSON limit on every route including public ones (cheap DoS). | Medium | FIXED (1 MB default, 12 MB only for document upload) |
| 10 | Headers/CORS | server.js:29 | `cors()` allows every origin; no security headers. | Medium | FIXED |
| 11 | Error handling | server.js | No error handler: bad JSON / thrown errors can leak stack traces. | Medium | FIXED |
| 12 | Data safety | db.js:75-77 | Whole JSON file rewritten non-atomically on every change (crash = corrupt file). No backup or tested restore. | Medium | FIXED (atomic write + backup/restore scripts) |
| 13 | Login | routes.js:500-512 | Wrong-email answers faster than wrong-password (user enumeration); email match is case-sensitive. | Medium | FIXED |
| 14 | Static files | server.js:38 | Old `backup-before-*` folders inside `frontend/` are publicly downloadable. | Medium | FIXED (blocked) |
| 15 | Tests/CI | — | No tests, no CI. | Medium | FIXED |
| 16 | Public enquiry | routes.js:568-585 | No length limits / email check on enquiry fields. | Medium | FIXED |
| 17 | Logging | server.js:36 | Console-only `morgan('dev')`, no request ID. | Low | TODO |
| 18 | Concurrency | db.js | JSON file store re-reads the whole file per call; two simultaneous writers can lose updates. Real fix = move to a real database. | Low (single hotel) | TODO |
| 19 | Git hygiene | repo root | Backup folders committed (`backup-before-*`), no pre-commit secret scanner. | Low | TODO |
| 20 | Double booking | routes.js:338-349 | Room availability is not checked for date overlap when a public booking is created (only on auto check-in). | Low (bookings start as `pending`, staff confirms) | TODO |
| 21 | Auth | middleware.js | Token in sessionStorage (XSS-sensitive); no logout-everywhere. Mitigated by #2. | Low | TODO |
| 22 | Razorpay / SQLite | — | Not present in this repo. Must be re-audited when merged. | Info | N/A |

## Frontend secrets check
No API keys or secrets found in tracked files or git history. `.env` is git-ignored.

## Test coverage gaps found (before this work)
No automated tests existed for: login, public booking, role permissions, staff management, documents.
