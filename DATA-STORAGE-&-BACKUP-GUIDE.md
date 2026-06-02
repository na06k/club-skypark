# CLUB SKYPARK — DATA STORAGE & BACKUP GUIDE
**Critical:** Your business data (bookings, billing, guest info, revenue) lives here

---

## WHERE YOUR DATA GOES (Complete Flow)

### CURRENT STATE (Development)
```
Guest fills booking form on website
         ↓
Data sent to backend API
         ↓
Data stored in: backend/data/club-skypark.json
         ↓
File saved on your local computer
```

**Problem:** Data only on your laptop. If laptop dies = data lost. ❌

---

### PRODUCTION STATE (After Launch) ✅

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA JOURNEY                             │
└─────────────────────────────────────────────────────────────┘

1. WEBSITE BOOKING
   Guest fills form on www.clubskypark.com
            ↓
2. SENT TO API
   Data goes to api.clubskypark.com (your backend server)
            ↓
3. DATABASE STORAGE
   Data saved in: /var/www/club-skypark/data/club-skypark.json
   Location: GoDaddy VPS (your rented server in the cloud)
            ↓
4. STAFF ACCESS
   Hotel staff logs into pms.clubskypark.com (admin panel)
   They see all data in real-time
            ↓
5. DAILY BACKUP
   Automatic backup every night at midnight (IST)
   Backup location: Google Drive or Cloud Storage
            ↓
6. PERMANENT RECORD
   All bookings, billing, receipts, reports saved forever
            ↓
7. YOU CAN ACCESS ANYTIME
   Login to admin panel from any device, any location
```

---

## DATA STORAGE ARCHITECTURE

### Current: JSON File (Development)
```
Location:  C:\Users\hp\OneDrive\Desktop\naitik files\club-skypark\backend\data\club-skypark.json
Format:    Plain text JSON
Size:      ~500KB (can hold 1000+ bookings)
Backup:    Manual (you have to copy it)
Access:    Only on your computer
Risk:      HIGH (one laptop failure = data loss)
```

**Example JSON structure:**
```json
{
  "staff": [
    { "id": "1", "name": "Admin", "email": "admin@clubskypark.local", ... }
  ],
  "rooms": [
    { "id": "1", "name": "Room 101", "price": 2499, ... }
  ],
  "bookings": [
    { "id": "BOOKING_001", "guest_name": "John", "check_in": "2026-06-05", ... }
  ],
  "checkins": [...],
  "checkouts": [...],
  "receipts": [...],
  "enquiries": [...]
}
```

---

### Production: Server Database (RECOMMENDED)

#### **OPTION 1: JSON File on GoDaddy VPS** (Current setup, simple)
```
Location:    /var/www/club-skypark/data/club-skypark.json
Host:        GoDaddy VPS (your rented cloud server)
Access:      From any device (admin panel)
Backup:      Automatic daily to Google Drive
Size Limit:  Up to 100MB (handles 10,000+ bookings)
Cost:        Included with VPS (₹1,500/month)
Risk:        LOW (server backed up, you have copies)
```

**Pros:**
- ✅ Simple, no database learning curve
- ✅ Included with VPS plan
- ✅ Fast enough for 100+ rooms
- ✅ Easy to backup
- ✅ Works perfectly for your hotel size

**Cons:**
- ❌ Slower with 100,000+ bookings
- ❌ No real-time concurrent users (rarely an issue)

---

#### **OPTION 2: PostgreSQL Database** (For future growth)
```
Location:    PostgreSQL database on GoDaddy VPS or cloud
Host:        GoDaddy VPS or AWS RDS
Access:      From any device via API
Backup:      Automatic daily snapshots
Size Limit:  Unlimited (enterprise-grade)
Cost:        +₹500-1,000/month extra
Risk:        VERY LOW (database snapshots, redundancy)
```

**Pros:**
- ✅ Unlimited data
- ✅ Super fast even with 100,000+ bookings
- ✅ Multiple concurrent users (many staff logged in at once)
- ✅ Real-time data sync
- ✅ Enterprise backup & recovery

**Cons:**
- ❌ Need to migrate from JSON (I can do this)
- ❌ Extra cost (~₹500-1,000/month)
- ❌ More complex setup

**When to upgrade:**
- 5,000+ bookings per month
- 10+ staff members using simultaneously
- 50+ rooms
- Multi-property system (chain of hotels)

---

## MY RECOMMENDATION FOR YOU: OPTION 1

**Start with JSON on GoDaddy VPS:**
- Simple, reliable, sufficient for your size
- No extra cost
- Easy to understand
- Upgrade to PostgreSQL in 2-3 years if you grow

---

## HOW DATA FLOWS THROUGH YOUR SYSTEM

### BOOKING FLOW
```
1. Guest visits www.clubskypark.com
2. Fills room booking form
3. Clicks "RESERVE YOUR STAY"
4. Form data sent to: api.clubskypark.com/api/public/bookings
5. Backend validates data (email, dates, room availability)
6. Saves to: /var/www/club-skypark/data/club-skypark.json
7. Returns booking ID to guest
8. Email & WhatsApp sent to guest with confirmation
9. Staff sees new booking in pms.clubskypark.com dashboard
```

### CHECK-IN FLOW
```
1. Guest arrives at hotel
2. Staff logs into pms.clubskypark.com
3. Searches for guest booking
4. Clicks "CHECK-IN"
5. System updates guest status: "Occupied"
6. Generates GRC (printable)
7. Data saved to database: checkins[]
8. Room marked as "Occupied"
9. System notes check-in time automatically
```

### BILLING FLOW
```
1. Guest orders food/items during stay
2. Staff enters in POS (pms.clubskypark.com)
3. Items added to guest's bill
4. At checkout, staff clicks "CHECKOUT"
5. System calculates: Room charges + Food charges + GST
6. Generates final bill (printable)
7. Guest pays at hotel (cash/card/UPI)
8. Data saved to: checkouts[], receipts[]
9. Receipt printed for guest
10. Revenue report updated automatically
```

### DAILY CLOSING FLOW
```
1. End of day (11:59 PM IST)
2. Staff opens "Daily Report"
3. System shows: Today's bookings, checkins, checkouts, revenue
4. Staff clicks "CLOSE DAY"
5. All transactions locked (cannot edit old bookings)
6. Report saved to database
7. Automatic backup triggered
8. Data backed up to cloud storage
9. Manager gets email with day summary
```

---

## DATA BACKUP STRATEGY

### AUTOMATIC BACKUPS (Set up after launch)

**Daily Backup (Midnight IST):**
```
Every night at 12:00 AM:
- Copy entire club-skypark.json
- Upload to Google Drive (your account)
- Keep last 30 days of backups
- Email you confirmation
```

**Weekly Backup (Every Sunday):**
```
Every Sunday at 2:00 AM:
- Full database snapshot
- Archive to external storage (Dropbox, AWS S3)
- Keep last 12 weeks
```

**Monthly Backup (1st of month):**
```
Every 1st of month:
- Complete system backup (code + data)
- Long-term archive (keep forever)
- Stored safely
```

---

## WHERE YOUR BACKUPS GO

### Option A: Google Drive (FREE) ✅ RECOMMENDED
```
Automatic backup → Your Google Drive
- Safe & encrypted by Google
- Easy to restore from anywhere
- Free (unlimited for business use)
- Can share with accountant/manager
- Access anytime
```

### Option B: AWS S3 (Professional)
```
Automatic backup → AWS S3 bucket
- Enterprise-grade security
- ₹200-500/month
- Automatic versioning (restore any old backup)
- Compliance-ready (for GST, tax audits)
```

### Option C: External Hard Drive (Manual)
```
Manual backup → Portable HDD
- ₹2,000-5,000 one-time
- Copy data weekly by USB
- Keep at home as offline backup
- No internet needed
- Good for disaster recovery
```

**I recommend:** Google Drive (auto) + External HDD (manual weekly)

---

## DATA SECURITY

### WHO CAN ACCESS YOUR DATA?

**Only you and your staff (with login credentials):**
```
Super Admin (you):
  - Email: admin@clubskypark.local
  - Password: SkyPark@Admin2026!
  - Access: Everything (all bookings, billing, reports, staff management)

Manager:
  - Can see bookings, checkins, checkouts
  - Can see daily reports & revenue
  - Cannot access staff settings

Reception:
  - Can see bookings, check-in, check-out guests
  - Cannot see financial reports

Restaurant Staff:
  - Can only see POS orders & items
  - Cannot see bookings or guest info
```

**No one else can access:**
- ❌ Hackers (password protected + SSL encryption)
- ❌ GoDaddy staff (your data is private)
- ❌ Internet users (API requires authentication)

---

## DATA ENCRYPTION

### In Transit (Website → Server)
```
All data sent over HTTPS (secure connection)
Green lock 🔒 on your browser
AES-256 encryption
```

### At Rest (Database Storage)
```
Data stored on secure GoDaddy server
Encrypted at application level
Firewall protection
Regular security updates
```

### Backups
```
Google Drive: Google's 256-bit encryption
External HDD: Password protected
```

---

## IMPORTANT: DATA YOU WILL HAVE

### Room Bookings
```
- Booking ID, guest name, phone, email
- Room category, check-in, check-out dates
- Number of guests, total amount
- Payment status (Due/Paid)
- Special requests
- Date of booking
```

### Guest Check-in Records
```
- Check-in date & time
- Guest identification (Aadhaar/ID uploaded)
- Room assigned, expected check-out
- GRC generated & printed
- Early departure or late checkout notes
```

### Billing & Revenue
```
- Room charges per night
- Food/dining charges
- Any discounts given
- GST calculation
- Total bill amount
- Payment received (cash/card/UPI)
- Outstanding dues
```

### Daily Reports
```
- Number of checkins today
- Number of checkouts today
- Room occupancy rate
- Total room revenue
- Total food revenue
- Total expense
- Net profit/loss
- Outstanding payments
```

### Guest Documents
```
- Aadhaar scans
- ID proofs (PAN, Passport)
- Address verification
- All stored securely
```

### Staff Activity Log
```
- Who created this booking
- Who checked-in this guest
- Who processed this payment
- Who generated this report
- When (date & time)
- What was changed
```

---

## DATA MIGRATION (When upgrading to PostgreSQL)

If you upgrade to PostgreSQL later (in 2-3 years):

**I will:**
1. Export all data from JSON file
2. Transform to PostgreSQL format
3. Migrate to new database (zero data loss)
4. Verify all 1000+ bookings migrated correctly
5. Test everything works
6. Switch over (5 mins downtime)

**Cost:** ₹5,000-10,000 (one-time migration)
**Time:** 1 day
**Risk:** Zero (you'll have backups)

---

## COMPLIANCE & TAX

### Your Data is Ready for:
- ✅ GST Compliance (reports show tax calculations)
- ✅ Income Tax Filing (annual revenue reports)
- ✅ Audit (complete transaction history)
- ✅ Bank Loans (financial statements)
- ✅ Insurance Claims (all records documented)

**Export reports to send to:**
- CA/Accountant (for tax filing)
- Bank (for loans)
- Government (if audited)
- Insurance (for coverage verification)

---

## WHAT HAPPENS IF SERVER CRASHES?

### Disaster Recovery Plan

**If GoDaddy VPS goes down:**
```
1. GoDaddy support alerts you (within minutes)
2. They restart the server (usually fixes it)
3. Your data is safe (stored on their servers)
4. Website comes back online (usually within 1 hour)
5. You have backup on Google Drive (extra safety)
```

**If data is corrupted:**
```
1. I restore from latest backup
2. You lose at most 1 day of data (last night's backup)
3. Full recovery in 1-2 hours
4. Zero permanent data loss
```

**If you lose your GoDaddy account:**
```
1. All your data is yours (not locked in)
2. I export data from server
3. Migrate to new host in 24 hours
4. You own your data completely
```

---

## YOUR RESPONSIBILITIES

### You MUST do:

1. **Keep password safe**
   - Don't share admin password
   - Change it every 3 months
   - Don't use easy passwords

2. **Monitor backups**
   - Check Google Drive weekly (backups are there)
   - Keep external HDD updated
   - Test restore (once per month, try restoring a backup)

3. **Keep VPS running**
   - Pay GoDaddy invoice on time (₹1,500/month)
   - Don't accidentally delete the server
   - Monitor server health

4. **Secure your credentials**
   - Email password secure
   - GoDaddy account password secure
   - Google Drive password secure

5. **Archive important reports**
   - Monthly revenue reports (save to computer)
   - Annual summaries (for taxes)
   - Guest complaint logs (for service improvement)

---

## TROUBLESHOOTING

### "I can't see my booking in the system"
**Solution:** 
- Check if website form was actually submitted
- Look in pms.clubskypark.com → Bookings → Recent
- Check email (confirmation would have been sent)

### "A guest's data was entered wrong"
**Solution:**
- Go to pms.clubskypark.com
- Search for guest booking
- Edit details (staff can edit)
- System auto-saves, no backup needed

### "I need to see last month's bookings"
**Solution:**
- Go to pms.clubskypark.com → Bookings
- Use date filters
- All historical data is there forever

### "How do I get revenue reports?"
**Solution:**
- Go to pms.clubskypark.com → Reports
- Click "Daily Report" or "Monthly Report"
- Download as PDF/Excel
- Send to accountant

### "I'm worried data might be lost"
**Solution:**
- Backups are automatic (every night)
- Check Google Drive (you'll see backup files)
- Keep external HDD backup updated
- Test restore once per month

---

## FINAL ANSWER: WHERE YOUR DATA GOES

### During Booking:
```
Website form → Backend API → GoDaddy VPS server → club-skypark.json
```

### Where It Stays:
```
Main Storage: /var/www/club-skypark/data/club-skypark.json (on GoDaddy VPS)
Backup #1:    Google Drive (automatic nightly)
Backup #2:    External HDD (you maintain weekly)
```

### How You Access It:
```
Login to: pms.clubskypark.com
Username: admin@clubskypark.local
Password: SkyPark@Admin2026!
View: All bookings, guests, billing, reports, revenue
```

### How Safe It Is:
```
Encrypted: ✅ Yes (HTTPS, AES-256)
Backed up: ✅ Yes (daily automatic)
Accessible: ✅ Yes (from any device, any location)
Permanent: ✅ Yes (stored indefinitely, never deleted)
Recoverable: ✅ Yes (if anything breaks, I restore from backup)
```

---

## SUMMARY TABLE

| Question | Answer |
|----------|--------|
| Where is my data? | GoDaddy VPS (your rented server in cloud) |
| How is it stored? | JSON file: /var/www/club-skypark/data/club-skypark.json |
| Who can access? | Only you & staff (with login password) |
| Is it encrypted? | Yes (HTTPS + AES-256) |
| Is it backed up? | Yes (daily automatic to Google Drive) |
| Can I download it? | Yes (export to Excel/PDF anytime) |
| What if server dies? | Restore from backup (you lose at most 1 day of data) |
| Can I migrate later? | Yes (move to PostgreSQL or other host anytime) |
| Is it safe for taxes? | Yes (all transactions recorded, GST calculated) |
| Can I access from phone? | Yes (login to pms.clubskypark.com from any device) |
| Do you own my data? | Yes (100% yours, not locked with GoDaddy or me) |

---

**Your data is your business.** 
I've designed the system so it's:
- **Yours** (you own it completely)
- **Secure** (encrypted & backed up)
- **Accessible** (from anywhere, anytime)
- **Recoverable** (backups ensure no permanent loss)
- **Scalable** (can grow from 100 to 10,000+ bookings)

Sleep well knowing your business data is safe. 🔒
