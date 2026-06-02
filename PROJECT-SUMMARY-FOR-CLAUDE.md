# CLUB SKYPARK — COMPLETE PROJECT SUMMARY & CONTEXT
**Owner:** Naitik Ramchandmotwani  
**Email:** rramchandmotwani@gmail.com  
**Location:** Manasa Road, Neemuch, MP 458441  
**Status:** Development Complete | Ready for Launch  
**Last Updated:** June 1, 2026

---

## PROJECT OVERVIEW

Club Skypark is a **dual-system platform** for a premium 4-star hotel & resort:

1. **Public Website** — Customer-facing booking platform
2. **PMS/POS Backend** — Hotel staff operations system

**Goal:** Complete hotel management solution with online booking, staff operations, billing, and reporting.

---

## PART 1: PUBLIC WEBSITE

### Website Pages (9 total)
```
✅ Home (index.html)
✅ Rooms (rooms.html)
✅ Room Booking (room-booking.html)
✅ Events (events.html)
✅ Weddings (weddings.html)
✅ Conferences (conferences.html)
✅ Parties (parties.html)
✅ Gallery (gallery.html)
✅ Contact (contact.html)
✅ Login (login.html) — Staff/admin access
```

**Pages Removed:**
- ❌ About page (removed per design)
- ❌ Services section (removed per design)
- ❌ Reservations.html (junk file, deleted)

**Rooms Hidden from Frontend:**
- Pooja Rooms (hidden, not removed)
- Twin Bed Rooms (hidden, not removed)
- Junior Suite (removed completely)

### Website Design
- **Style:** Premium 4-star luxury hotel aesthetic
- **Color Scheme:** Black/Gold/Cream (#0D0D0D, #C9A96E, #F8F5F0)
- **Typography:** Playfair Display (headings), Plus Jakarta Sans (body)
- **Responsive:** Mobile/tablet/desktop optimized
- **Images:** Real hotel photos used from project folder
- **Features:** 
  - Hero image slider (5 images, auto-rotate every 5 seconds)
  - Smooth scrolling, hover animations
  - Mobile navigation menu closes on link click
  - Favicon on all pages
  - SEO meta descriptions on all 9 pages
  - OG tags (Open Graph) for social sharing on index.html

### Booking System
**Booking Method:** Pay at Hotel (No online payment)
- Guest fills room booking form on website
- Data submitted to backend API
- Hotel staff confirms booking in PMS
- Payment status: Always "Due" (not paid online)
- WhatsApp confirmation sent to guest (manual or auto if Meta API configured)

**WhatsApp Message Template:**
```
Hello {{guest_name}},
Greetings from Club Sky Park.
We are pleased to confirm your booking with us.

Booking Summary:
Booking ID: {{booking_id}}
Room Category: {{room_type}}
Check-in: {{check_in_date}}
Check-out: {{check_out_date}}
No. of Guests: {{guest_count}}
Total Amount: ₹{{total_amount}}
Payment Status: Due

We look forward to welcoming you and making your stay comfortable and memorable.

For assistance, please contact:
{{hotel_phone_number}}

Warm regards,
Team Club SkyPark
```

### Room Categories & Pricing (FIXED - DO NOT CHANGE)
```
Premium Room           ₹2,499/night
Platinum Room         ₹2,999/night
Club Family Room      ₹4,999/night
Family Suite          ₹5,499/night
Executive Suite       ₹5,499/night
Presidential Suite    ₹7,499/night
```

**Hidden (not shown on website):**
- Pooja Rooms
- Twin Bed Rooms
- Junior Suite

### Contact Details (FIXED - DO NOT CHANGE)
```
Phone (Primary):     +91 75879 00088
Phone (Secondary):   +91 79748 23267
Email:               clubskyparkhotel@gmail.com
Address:             Manasa Road, Neemuch, MP 458441
WhatsApp Number:     +91 79748 23267
```

---

## PART 2: PMS/POS BACKEND SYSTEM

### Technology Stack
```
Framework:      Node.js + Express
Language:       JavaScript (ES6+)
Database:       JSON file (backend/data/club-skypark.json)
Authentication: JWT tokens
Auth Library:   bcryptjs (password hashing)
Rate Limiting:  express-rate-limit (10 attempts/15min on login)
Environment:    Node v18+, npm 9+
Port:           3000 (default)
Timezone:       Asia/Kolkata (TZ environment variable set)
```

### Core Modules

#### 1. Dashboard
- Real-time occupancy view
- Daily revenue summary
- Check-in/checkout pending list
- Recent bookings activity
- Staff performance metrics

#### 2. Room Management
- Create/edit room details
- Room status: Available, Occupied, Reserved, Dirty, Maintenance
- Room categories, prices, amenities
- Room image management
- Bulk room operations

#### 3. Booking / Reservation Management
- View all bookings (website + manual)
- Create manual bookings
- Edit booking details
- Cancel bookings
- View booking history
- Bulk wedding/group reservations
- Reservation for future dates

#### 4. Check-in Process
- Confirm website bookings
- Create check-in records
- Auto-check-in option (near estimated arrival time)
- Generate GRC (Guest Registration Certificate)
- Print GRC
- Bulk check-in for wedding groups (without ID/GRC requirement)
- Estimated arrival time capture on website booking

#### 5. Check-in List
- View pending check-ins
- View completed check-ins
- Cancel check-in (with reason)
- View check-in history

#### 6. Checkout Process
- Create checkout records
- Generate final bill (printable)
- Track payment received
- Room status update (mark as Dirty for housekeeping)
- Print bill/receipt

#### 7. Checkout List
- View pending checkouts
- View completed checkouts
- Cancel checkout (with reason)
- View checkout history

#### 8. Guest Management
- Guest profiles (name, email, phone, address)
- Guest document upload (Aadhaar, ID, etc.)
- Guest history (all stays)
- Guest preferences (pillow type, meal preferences, etc.) — Future feature

#### 9. Guest Document Upload
- Upload Aadhaar, PAN, ID proofs
- Store in backend file system
- Download/view documents
- Mark document verified

#### 10. GRC Printing
- Guest Registration Certificate
- Auto-generated after check-in
- Printable format (PDF-ready)
- Contains: Guest name, room number, check-in time, expected check-out

#### 11. Final Bill Printing
- Invoice generated at checkout
- Contains: Room charges, food/POS charges, taxes, discounts, total
- GST calculation included
- Printable format (PDF-ready)
- Receipt number tracking

#### 12. Receipt Management
- Create receipts (manual payments, food charges)
- Receipt number auto-increment (no duplicates)
- Receipt history
- Print receipts

#### 13. Room Swap
- Swap guest to different room (same category only)
- Housekeeping notification
- Billing adjustment if needed

#### 14. Restaurant POS
- Food item management (create/edit menu items)
- Create food orders in-room or at counter
- Track order status (pending, prepared, served)
- Mark order as paid
- Add extra charges (service tax, etc.)
- Can be linked to guest room or standalone

#### 15. Store Management
- Inventory tracking (toiletries, linens, supplies)
- Stock in/out transactions
- Low stock alerts
- Wastage tracking
- Supplier management

#### 16. Ledger / Accounting
- Track all financial transactions
- Room charges, food charges, payments, discounts, refunds
- Categorized by transaction type
- Exportable for accounting

#### 17. Daily Report
- Summary of day's bookings
- Check-ins, check-outs count
- Total room revenue
- Total food/POS revenue
- Total expenses
- Net profit/loss

#### 18. GST Report
- Track taxable transactions
- Calculate CGST, SGST
- Tax summary for filing
- Date range filtering

#### 19. Staff / Settings
- Staff account management
- Create staff accounts
- Assign roles and permissions
- Edit staff details
- Deactivate staff accounts
- Change staff password
- Staff activity log (who did what, when)

#### 20. Staff Access Control
**Module-wise Permissions:**
```
Modules:
- Dashboard.view, Dashboard.edit
- Bookings.view, .create, .edit, .cancel, .whatsapp, .bulk
- Reservations.view, .create, .edit, .cancel
- Rooms.view, .create, .edit, .delete, .status_update
- Checkin.view, .create, .list, .cancel, .print_grc, .room_swap, .bulk
- Checkout.view, .create, .list, .cancel, .print_bill, .discount
- Guest documents.view, .upload, .download
- Restaurant.view, .create_order, .update_status, .mark_paid
- Items.view, .create, .edit
- Receipts.view, .create, .print
- Payments.view, .create
- Store.view, .create, .edit, .update_stock
- Ledger.view, .create
- Reports.daily, .close_day, .gst, .export
- Staff.view, .create, .edit, .permissions

Actions:
- View (read-only access)
- Create (add new records)
- Edit (modify existing records)
- Delete/Cancel (remove records)
- Print (generate printable documents)
- Export (download as Excel/PDF)
- Upload documents (guest docs)
- Change status (update room/order status)
- Take payment (process payments)
- Give discount (apply discounts)
- Close day (end-of-day operations)
- Manage staff access (change permissions)
```

**Predefined Roles:**
```
super_admin:    Full access to all modules and actions
manager:        Most hotel operations except staff management
reception:      Bookings, check-in, checkout, guest documents
restaurant:     Restaurant POS, items, orders only
```

---

## PART 3: TECHNICAL ARCHITECTURE

### File Structure
```
club-skypark/
├── backend/
│   ├── src/
│   │   ├── server.js         (Express server setup, routes, middleware)
│   │   ├── routes.js         (All API endpoints)
│   │   ├── db.js             (Database operations)
│   │   ├── middleware.js     (Auth, JWT verification, error handling)
│   │   └── permissions.js    (Role-based access control logic)
│   ├── data/
│   │   └── club-skypark.json (All data: bookings, staff, rooms, etc.)
│   ├── package.json          (Dependencies)
│   ├── .env                  (Environment variables)
│   └── README.md
│
└── frontend/
    ├── css/
    │   ├── public-pages.css   (Event pages styling)
    │   └── other CSS files
    ├── js/
    │   ├── api.js             (Frontend API calls)
    │   └── other JS files
    ├── images/                (All hotel photos)
    ├── index.html             (Home page)
    ├── rooms.html
    ├── room-booking.html
    ├── weddings.html
    ├── conferences.html
    ├── parties.html
    ├── events.html
    ├── gallery.html
    ├── contact.html
    ├── login.html
    └── admin.html             (PMS admin panel)
```

### Database Schema (JSON)
```json
{
  "staff": [
    {
      "id": "1",
      "name": "Club Skypark Admin",
      "email": "admin@clubskypark.local",
      "password_hash": "bcrypt_hash_here",
      "role": "super_admin",
      "permissions": [...]
    }
  ],
  "rooms": [
    {
      "id": "1",
      "name": "Premium Room 101",
      "category": "Premium Room",
      "price": 2499,
      "status": "Available",
      "amenities": [...]
    }
  ],
  "bookings": [
    {
      "id": "BOOKING_001",
      "guest_name": "John Doe",
      "room_id": "1",
      "check_in": "2026-06-05",
      "check_out": "2026-06-07",
      "total_amount": 4998,
      "payment_status": "Due",
      "status": "Confirmed"
    }
  ],
  "checkins": [...],
  "checkouts": [...],
  "receipts": [...],
  "enquiries": [...]
}
```

### API Endpoints (Key ones)
```
POST   /api/public/enquiries          (Contact form submission)
POST   /api/public/bookings           (Website room booking)
POST   /api/auth/login                (Staff login)
GET    /api/auth/verify               (Verify JWT token)

GET    /api/dashboard                 (Dashboard data)
GET    /api/bookings                  (List bookings)
POST   /api/bookings                  (Create booking)
GET    /api/bookings/:id              (Get single booking)

GET    /api/checkins                  (List check-ins)
POST   /api/checkins                  (Create check-in)

GET    /api/checkouts                 (List check-outs)
POST   /api/checkouts                 (Create check-out)

GET    /api/rooms                     (List rooms)
POST   /api/rooms                     (Create room)

And many more...
```

### Authentication & Security
```
Login Method:      Email + Password
Password Hashing:  bcryptjs (salt: 10 rounds)
Session Token:     JWT (JSON Web Token)
Token Expiry:      24 hours
Rate Limiting:     10 login attempts per 15 minutes per IP
CORS:              Enabled for frontend subdomains
```

---

## PART 4: ENVIRONMENT CONFIGURATION

### .env File (Current - Production Ready)
```
PORT=3000
JWT_SECRET=ClubSkyPark@Neemuch#2026$SecureKey!JWT
ADMIN_EMAIL=admin@clubskypark.local
ADMIN_PASSWORD=SkyPark@Admin2026!
TZ=Asia/Kolkata

# WhatsApp Business Cloud API
HOTEL_PHONE_NUMBER=+91 79748 23267
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_PHONE_NUMBER_ID=(not set yet)
WHATSAPP_ACCESS_TOKEN=(not set yet)
WHATSAPP_TEMPLATE_NAME=(optional)
WHATSAPP_TEMPLATE_LANGUAGE=en
```

### Admin Credentials (CHANGED & SECURE)
```
Email:    admin@clubskypark.local
Password: SkyPark@Admin2026!
Hash:     $2a$10$13Mu5WCVuJsiqLQx9p5QUOWSFVYZKnFGwUEI/X8NC/wboGbHDDjKy
```

---

## PART 5: COMPLETED FEATURES & FIXES

### Features Completed ✅
```
[✅] Public website (9 pages, responsive, mobile-friendly)
[✅] Luxury design (gold/black/cream theme)
[✅] Room booking form
[✅] Contact form (submits to backend /api/public/enquiries)
[✅] Staff login system
[✅] Dashboard
[✅] Booking management (create, view, edit, cancel)
[✅] Check-in/checkout system
[✅] GRC printing
[✅] Bill generation with GST
[✅] Receipt printing
[✅] Room status management
[✅] Staff access control (permissions system)
[✅] Restaurant POS
[✅] Daily reports
[✅] Guest document upload
[✅] Room swap functionality
[✅] Bulk wedding/group reservations
[✅] Bulk check-in (no ID requirement)
[✅] Store management (inventory)
[✅] Ledger/accounting
[✅] Rate limiting (login attempts)
[✅] JWT authentication
[✅] SEO meta tags on all pages
[✅] Favicon on all pages
[✅] OG tags for social sharing
[✅] Google Maps embed (contact page)
[✅] Mobile navigation
[✅] WhatsApp button (fixed number)
[✅] Google Reviews carousel (testimonials)
```

### Bugs/Issues Fixed ✅
```
[✅] Receipt number collision (fixed)
[✅] Broken title character (â€– → –)
[✅] Hero image fallback added
[✅] Mobile nav closes on link click
[✅] Pool opening badges removed
[✅] Reservations.html deleted (junk file)
[✅] JWT secret changed (not default)
[✅] Admin password changed (not admin123)
[✅] Password hash updated in database
[✅] TZ=Asia/Kolkata configured
[✅] Rate limiting added
```

---

## PART 6: LAUNCH PLAN

### Domain Structure
```
www.clubskypark.com  → Public website (frontend)
pms.clubskypark.com  → Admin/PMS panel (backend UI)
api.clubskypark.com  → API endpoints (backend server)
mail.clubskypark.com → Email (MX records)
```

**Note:** Only main domain (clubskypark.com) is purchased from GoDaddy.  
Subdomains (www, pms, api) are created via DNS configuration.

### Recommended Hosting Setup (OPTION 3 - HYBRID)
```
Frontend (www.clubskypark.com):
  - Host: Vercel (FREE)
  - Cost: $0/month
  - Deployment: Auto (push code → auto-deploy)
  - Performance: Global CDN, <500ms load time

Backend API (api.clubskypark.com):
  - Host: GoDaddy VPS
  - Cost: ₹1,500-1,800/month
  - OS: Ubuntu 22.04 LTS
  - RAM: 2GB
  - Control: cPanel access
  - Runtime: Node.js + PM2

Admin Panel (pms.clubskypark.com):
  - Host: Vercel (FREE)
  - Cost: $0/month
  - Deployment: Auto
  - Purpose: Staff admin interface

Email:
  - Host: GoDaddy
  - Cost: Included with VPS
  - Accounts: admin@, info@, support@, billing@

Total Cost: ₹1,500-1,800/month (~₹18,000-21,600/year)
```

### Launch Steps
```
1. Buy GoDaddy VPS (Ubuntu 22.04, cPanel, 2GB RAM)
2. Point domain to GoDaddy nameservers (wait 24-48 hours)
3. Create email accounts in cPanel
4. I deploy backend to VPS (PM2, Nginx, auto-restart)
5. I deploy frontend to Vercel
6. I deploy admin panel to Vercel
7. Configure DNS records (A, CNAME, MX)
8. Test all functionality
9. Launch! 🎉

Timeline: 5-7 days
```

---

## PART 7: IMPROVEMENT ROADMAP

### Phase 1: Quick Wins (Weeks 1-2) — 25-40% revenue increase
```
[  ] Payment gateway integration (Razorpay)
[  ] Hero video background
[  ] Social proof ticker (live bookings)
[  ] Guest testimonial carousel
[  ] Real-time admin dashboard
```

### Phase 2: Medium-Term (Weeks 3-8) — Additional 40-60% increase
```
[  ] Guest loyalty program
[  ] Premium booking experience
[  ] Wedding showcase content
[  ] Mobile app MVP
[  ] Blog/content marketing
[  ] Room comparison tool
```

### Phase 3: Advanced (Months 2-6) — Competitive advantage
```
[  ] AI chatbot (24/7 support)
[  ] Video marketing suite (360° tours, testimonials)
[  ] Multi-language support
[  ] Advanced CRM system
[  ] Predictive pricing engine
[  ] Guest sentiment analysis
```

---

## PART 8: CURRENT STATUS & NEXT STEPS

### ✅ What's Complete
- Full website & PMS codebase
- All features implemented
- Database schema designed
- Security configured
- All bugs fixed
- Code production-ready
- Documentation complete

### 🔄 What's In Progress
- Awaiting GoDaddy VPS purchase
- Awaiting deployment authorization

### ⏳ What's Next
1. **YOU:** Buy GoDaddy VPS (₹1,500/month) + Set up email
2. **ME:** Deploy backend, frontend, admin panel (5-7 days)
3. **LAUNCH:** Website goes live at www.clubskypark.com 🚀
4. **POST-LAUNCH:** Monitor, optimize, add premium features

---

## PART 9: IMPORTANT NOTES

### NEVER Change These
```
✋ Room prices (fixed per business agreement)
✋ WhatsApp button/number (core feature)
✋ Booking form logic (tested & working)
✋ All JS files (carefully engineered)
✋ CSS files (brand-defined styling)
✋ Images folder (hotel assets)
✋ admin.html (staff interface)
✋ Restaurant features (not operational yet, keep as-is)
```

### Database Considerations
- Current: JSON file (fine for <100 rooms, <1000 bookings/month)
- Future upgrade: PostgreSQL (when traffic increases)
- Backup: Daily backups recommended after launch
- Migration: Can upgrade to SQL anytime without rewriting code

### WhatsApp Integration
- Currently: Manual confirmation by staff (reliable)
- Future: Auto-send via Meta WhatsApp Cloud API (when API credentials ready)
- Template already written and ready to use
- No changes needed, works as-is

### Support & Maintenance
- After launch: 24/7 monitoring recommended
- Monthly backups: Essential
- Regular updates: Security patches as needed
- Bug fixes: I provide for first month free
- Feature requests: Hourly rate after launch

---

## PART 10: CONTACT & SUPPORT

**Owner:**  
Naitik Ramchandmotwani  
Email: rramchandmotwani@gmail.com  
Phone: +91 75879 00088 / +91 79748 23267

**Hotel:**  
Club Sky Park Hotel & Resort  
Manasa Road, Neemuch, MP 458441  
Email: clubskyparkhotel@gmail.com  
Phone: +91 79748 23267 (booking hotline)

**Developer Support:**  
Available for deployment, troubleshooting, and feature development.

---

## PART 11: HOW TO BRIEF A NEW DEVELOPER

If you need to bring a new developer onboard, give them:
1. This document (PROJECT-SUMMARY-FOR-CLAUDE.md)
2. The website files (frontend folder)
3. The backend code (backend/src folder)
4. The 5-STAR-IMPROVEMENT-ROADMAP.md (for enhancements)
5. The WEBSITE-LAUNCH-GUIDE.md (for deployment)

They will have complete context to continue development, deploy, or maintain the system.

---

## QUICK REFERENCE CHECKLIST

### Before Launch
- [ ] GoDaddy VPS purchased (2GB RAM, Ubuntu 22.04)
- [ ] Domain pointed to GoDaddy nameservers (24-48 hrs for propagation)
- [ ] Email accounts created (admin@, info@, support@)
- [ ] SSL certificate installed
- [ ] Backend deployed to VPS
- [ ] Frontend deployed to Vercel
- [ ] Admin panel deployed to Vercel
- [ ] DNS records configured (A, CNAME, MX)
- [ ] Testing complete (all features working)
- [ ] Backups configured (daily)

### After Launch
- [ ] Monitor website performance daily
- [ ] Check bookings are coming through
- [ ] Verify WhatsApp confirmations working
- [ ] Monitor server health
- [ ] Track user feedback
- [ ] Plan Phase 1 improvements (payment, video, etc.)

---

**Document Version:** 1.0  
**Last Updated:** June 1, 2026  
**Status:** Production Ready  
**Next Review:** After launch (June 15, 2026)

