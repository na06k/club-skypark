# Club Skypark Backend

Express + SQLite backend for the Club Skypark website and admin panel.

## Setup

```bash
cd backend
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3000`.

Default seeded admin login:

```text
Email: admin@clubskypark.local
Password: admin123
```

Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `.env` before using this outside local development.

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
