# Club Skypark Backend

Express + JSON-file backend for the Club Skypark website and admin/PMS panel.

All local backend data is saved in:

```text
backend/data/club-skypark.json
```

## Setup

```bash
cd backend
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3000`.

Default seeded admin login for a fresh empty database:

```text
Email: admin@clubskypark.local
Password: admin123
```

Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `.env` before using this outside local development. Existing local data may already have a changed admin password.

## Main API

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/public/rooms`
- `POST /api/public/bookings`
- `GET /api/bookings`
- `PATCH /api/bookings/:id/status`
- `GET/POST/PATCH/DELETE /api/rooms`
- `POST /api/checkins`
- `POST /api/checkouts/:guestId`
- `GET/POST /api/payments`
- `GET/POST /api/restaurant-orders`
- `GET/POST /api/staff`

## PMS / POS Extensions

The backend now includes API support for a wider hotel PMS/POS workflow:

- Guest profile history, preferences, notes and flags
- Housekeeping tasks, maintenance requests and room status updates
- Laundry, room service, minibar items and guest service charges
- Staff schedules, attendance and roster entries
- Suppliers, stock movement, inventory alerts and wastage tracking
- Loyalty members, points and vouchers
- Dynamic room pricing rules and price calculation
- Analytics for dashboard, revenue, occupancy and guests
- Outstanding payments, reminders and notification templates

New API groups:

- `GET /api/guest-profiles`
- `GET/PATCH /api/guest-profiles/:id`
- `POST /api/guest-profiles/:id/notes`
- `POST /api/guest-profiles/:id/flags`
- `GET/POST/PATCH /api/housekeeping/tasks`
- `GET/POST/PATCH /api/maintenance-requests`
- `GET/POST/PATCH /api/laundry/orders`
- `GET/POST/PATCH /api/room-service/orders`
- `GET/POST /api/minibar/items`
- `GET /api/guest-service-charges`
- `GET/POST/PATCH /api/staff-schedules`
- `GET/POST/PATCH /api/staff-attendance`
- `GET/POST /api/staff-rosters`
- `GET/POST/PATCH /api/suppliers`
- `GET/POST/PATCH /api/inventory/items`
- `GET/POST /api/inventory/movements`
- `GET/POST /api/inventory/wastage`
- `GET /api/inventory/alerts`
- `GET/POST /api/loyalty/members`
- `POST /api/loyalty/points`
- `POST /api/loyalty/vouchers`
- `GET/POST/PATCH /api/pricing-rules`
- `GET /api/pricing/calculate`
- `GET /api/analytics/dashboard`
- `GET /api/analytics/revenue`
- `GET /api/analytics/occupancy`
- `GET /api/analytics/guests`
- `GET /api/payments/outstanding`
- `POST /api/payment-reminders`
- `GET/POST/PATCH /api/notifications`
- `GET/POST /api/notification-templates`

## Print Layouts

Print-friendly HTML layouts are available for reception use:

- `GET /api/print/grc/:id`
- `GET /api/print/bill/:id`
- `GET /api/print/receipt/:id`
- `GET /api/print/daily-closing`
- `GET /api/print/gst`
- `GET /api/print/checkout-summary/:id`
- `GET /api/print/housekeeping-daily-sheet`

## Added Management Modules

The admin panel now includes backend-backed modules for:

- Receipts and printable event/hotel invoices with GST line items
- Daily night-closing report
- Store stock management and closing stock updates
- Room/event reservations with reserved room status
- Restaurant and store item master
- Cash ledger report
- GST report from receipt line items
- Guest document upload during check-in

New API groups:

- `GET/POST /api/receipts`
- `GET /api/reports/daily`
- `POST /api/reports/daily/close`
- `GET/POST /api/store-items`
- `POST /api/store-items/:id/movements`
- `GET/POST /api/reservations`
- `GET/POST /api/items`
- `GET/POST /api/ledger`
- `GET /api/reports/gst`
- `POST /api/guest-documents`
- `GET /api/guest-documents/:id/download`
