# CLUB SKYPARK — PURCHASE CHECKLIST
**What you need to buy to launch the website & PMS**

---

## MANDATORY (Must buy to go live)

### 1. ✅ GODADDY DOMAIN
**Status:** Already purchased by you  
**Product:** clubskypark.com domain  
**Cost:** ₹1,000/year (already paid)  
**Renewal:** Auto-renews yearly (₹1,000)  
**What it does:** Your website address (www.clubskypark.com)

---

### 2. 🔴 GODADDY VPS HOSTING (BUY NOW)
**Link:** https://www.godaddy.com/en-in/hosting/vps-hosting

**Specifications to choose:**
```
Hosting Type:     VPS Hosting (not shared hosting)
RAM:              2GB (minimum for Node.js)
vCPU:             2 cores
Storage:          50GB SSD
OS:               Ubuntu 22.04 LTS
Control Panel:    cPanel (optional but recommended)
Backup:           Yes, enable daily backups
SSL Certificate:  Free (included)
```

**Cost Options:**
```
₹1,500/month    → 2GB RAM, 2 vCPU, 50GB SSD (RECOMMENDED)
₹2,000/month    → 4GB RAM, 4 vCPU, 100GB SSD (if you expect high traffic)
₹3,000/month    → 8GB RAM, 8 vCPU, 200GB SSD (overkill for now)
```

**I recommend:** **₹1,500/month plan**
- Handles up to 100,000+ monthly bookings
- Perfect for 30 rooms
- Can upgrade anytime

**What comes with it:**
- ✅ Server to run your backend API
- ✅ Database storage (club-skypark.json)
- ✅ Email hosting (admin@, info@, support@)
- ✅ SSL certificate (HTTPS)
- ✅ Daily automatic backups
- ✅ 24/7 GoDaddy support

**How to buy:**
1. Go to https://www.godaddy.com/en-in/hosting/vps-hosting
2. Click "VPS Hosting"
3. Select 2GB RAM plan (₹1,500/month)
4. Choose Ubuntu 22.04 LTS OS
5. Add cPanel (optional, helpful for beginners)
6. Billing: Choose **Monthly** (to test first)
7. Checkout & pay

**Time to activate:** 15-30 minutes after payment

---

## OPTIONAL BUT RECOMMENDED

### 3. 📦 EXTERNAL HARD DRIVE (for backup)
**Purpose:** Weekly backup of your database (offline copy)

**Specifications:**
```
Capacity:    1TB or 2TB (plenty for business data)
Type:        External USB HDD or SSD
Brand:       Seagate, Western Digital, Transcend
Speed:       USB 3.0 (fast backup)
```

**Where to buy:**
- Amazon.in
- Flipkart
- Local computer shop

**Cost:**
```
1TB:   ₹2,500-3,500
2TB:   ₹4,000-5,500
```

**I recommend:** **₹3,000-4,000 (1TB)**
- Sufficient for 5+ years of data
- Don't need huge capacity

**What it does:**
- Automatic backup every week
- Offline copy (if internet fails)
- Extra safety layer
- Easy to restore if disaster

**How to use:**
- Connect to computer weekly
- I'll automate backup process
- Keep in safe location (not at hotel)

---

### 4. 💳 RAZORPAY PAYMENT GATEWAY (for future)
**Status:** Optional for Phase 1 (for future payment integration)

**Link:** https://razorpay.com

**Cost:** FREE to register
- Setup fee: ₹0
- Monthly fee: ₹0
- Commission: 2% + ₹3 per transaction (only when you get paid)

**Example:**
```
Guest pays ₹5,000 online
You receive: ₹5,000 - (2% of ₹5,000 + ₹3) = ₹4,897
Commission to Razorpay: ₹103
```

**When to buy:** LATER (Phase 2, after launch)
- Currently you accept "Pay at Hotel" only
- Add this feature in 2-3 weeks

**How to get:**
1. Go to https://razorpay.com
2. Click "Sign Up"
3. Fill business details
4. Verify bank account
5. Get API keys
6. I integrate into your booking form

---

### 5. 📧 SENDGRID EMAIL SERVICE (optional, for bulk emails)
**Status:** Optional (email from GoDaddy is included)

**Link:** https://sendgrid.com

**Cost:** 
```
Free tier:    100 emails/day (enough for you)
Paid tier:    $9/month (1,000 emails/day)
```

**When to buy:** LATER (Phase 2)
- Currently GoDaddy email is sufficient
- Add this if you send newsletters or bulk confirmations

---

## INFRASTRUCTURE SUMMARY (What you're buying)

```
┌──────────────────────────────────────────────────────────┐
│                  WHAT YOU'RE BUYING                       │
└──────────────────────────────────────────────────────────┘

💰 MANDATORY PURCHASES (to go live)
├── GoDaddy Domain (clubskypark.com)
│   └── ✅ Already paid ₹1,000/year
└── GoDaddy VPS Hosting (2GB RAM, ₹1,500/month)
    └── 🔴 BUY NOW (this is what I need to deploy)

💡 RECOMMENDED PURCHASES (extra safety)
├── External HDD 1TB (₹3,000-4,000, one-time)
│   └── Weekly data backup
└── Razorpay Payment Gateway (FREE now, ₹0 until you use)
    └── For Phase 2 online payments

🎁 OPTIONAL PURCHASES (future enhancements)
├── SendGrid Email (FREE or $9/month)
│   └── For bulk email campaigns
├── PostgreSQL Database (₹500-1,000/month, in 2-3 years)
│   └── For massive growth
└── Cloudflare CDN (₹200-500/month, optional)
    └── For super-fast website
```

---

## TOTAL COST TO LAUNCH

### ONE-TIME COSTS
```
GoDaddy Domain          ₹1,000        (already paid by you)
External HDD 1TB        ₹3,000-4,000  (recommended)
─────────────────────────────────────
TOTAL ONE-TIME:         ₹4,000-5,000
```

### MONTHLY RECURRING COSTS
```
GoDaddy VPS (2GB RAM)   ₹1,500/month
GoDaddy Email           ₹0 (included)
Google Drive Backup     ₹0 (free)
─────────────────────────────────────
TOTAL MONTHLY:          ₹1,500/month
```

### YEARLY COSTS
```
GoDaddy VPS             ₹1,500 × 12 = ₹18,000/year
Domain Renewal          ₹1,000/year
External HDD (one-time) ₹4,000 (spreads over 5+ years)
─────────────────────────────────────
TOTAL YEARLY:           ~₹23,000/year
```

### COST COMPARISON: Before vs After

**Before (Manual POS):**
- Cash book (₹100)
- Receipt book (₹200)
- Pen & paper (₹50)
- Manual calculation (frustration)
- **Total: ₹350 (unreliable, error-prone)**

**After (Digital PMS):**
- GoDaddy VPS: ₹1,500/month
- External backup: ₹4,000 one-time
- **Total: ₹1,500/month (automatic, accurate, professional)**

**ROI:** With even 2-3 extra bookings per month × ₹5,000 average = ₹10,000-15,000 extra revenue. **System pays for itself in first month!**

---

## DETAILED SHOPPING LIST WITH LINKS

### ✅ STEP 1: BUY GODADDY VPS (DO THIS TODAY)

**Link:** https://www.godaddy.com/en-in/hosting/vps-hosting

**Exact steps:**
1. Click "VPS Hosting" button
2. Scroll down, find **₹1,500/month plan** (2GB RAM)
3. Click "Choose Plan"
4. Select OS: **Ubuntu 22.04 LTS**
5. Control Panel: **cPanel** (check if available)
6. Backup: **Enable** (highly recommended)
7. Billing cycle: **Monthly** (test first)
8. Click "Add to Cart"
9. Login/Create GoDaddy account
10. Billing address: Neemuch, MP
11. Payment: Credit card / Debit card / UPI
12. Click "Complete Purchase"

**After purchase:**
- GoDaddy sends email with:
  - Server IP address (e.g., 123.45.67.89)
  - Root username (usually: root)
  - Root password (random, save it!)
  - cPanel URL (e.g., https://123.45.67.89:2083)
  - Setup instructions

**⚠️ SAVE THESE IMMEDIATELY:** Copy & paste into a text file, email to yourself

---

### 📦 STEP 2: BUY EXTERNAL HDD (Optional but recommended)

**Link:** https://www.amazon.in (or Flipkart)

**Search:** "External Hard Drive 1TB"

**Recommended options:**
```
Seagate Barracuda 1TB
- ₹3,500-4,000
- USB 3.0
- Works with any computer

Western Digital Elements 1TB
- ₹3,000-3,500
- USB 3.0
- Reliable, popular

Transcend StoreJet 1TB
- ₹3,000-4,000
- Durable, military-tested
```

**After buying:**
- Connect to your computer
- I'll set up automatic weekly backup
- Keep in safe place (home, not hotel)

---

### 💳 STEP 3: REGISTER RAZORPAY (Optional, for Phase 2)

**Link:** https://razorpay.com

**Do this:** LATER (in 2-3 weeks after launch)

**Steps:**
1. Go to https://razorpay.com
2. Click "Sign Up"
3. Choose "Business" account
4. Fill details (name, email, phone, business)
5. Verify email & phone
6. Bank account verification (takes 1-2 days)
7. Get API keys for website integration

**No cost:** Registration is 100% free, you only pay commission when guests pay online

---

## WHAT I WILL PROVIDE

**I will give you for free:**
- ✅ Setup guide for GoDaddy VPS
- ✅ Backup automation setup
- ✅ Domain configuration help
- ✅ SSL certificate setup (free from GoDaddy)
- ✅ Email account creation guide
- ✅ Testing checklist

**You pay for:**
- 💰 GoDaddy VPS (₹1,500/month)
- 💰 GoDaddy Domain (₹1,000/year, already paid)
- 💰 External HDD (optional, ₹3,000-4,000)

**My deployment fee:** ₹15,000-20,000 (one-time, for setting up everything)

---

## SHOPPING SUMMARY TABLE

| Item | Cost | Where | When | Mandatory? |
|------|------|-------|------|-----------|
| Domain (clubskypark.com) | ₹1,000/yr | GoDaddy | ✅ Done | YES |
| VPS Hosting (2GB) | ₹1,500/mo | GoDaddy | 🔴 TODAY | YES |
| External HDD 1TB | ₹3,000-4,000 | Amazon/FK | This week | NO (recommended) |
| Razorpay | FREE | razorpay.com | Week 3 | NO (Phase 2) |
| SendGrid Email | FREE-$9/mo | sendgrid.com | Week 4 | NO (Phase 2) |
| **TOTAL TO LAUNCH** | **₹1,500/mo** | - | - | - |

---

## IMMEDIATE ACTION ITEMS (TODAY)

### ✅ DO RIGHT NOW:

**[ ] 1. Buy GoDaddy VPS (₹1,500/month)**
- Go to: https://www.godaddy.com/en-in/hosting/vps-hosting
- Select: 2GB RAM plan
- Pay & get credentials
- Send me IP, username, password

**[ ] 2. Get Details Ready**
- Business email: clubskyparkhotel@gmail.com (confirm)
- Business phone: +91 79748 23267 (confirm)
- Your GST number (if you have it): _______________

**[ ] 3. Confirm with me:**
- GoDaddy VPS purchased? (Y/N)
- Ready to launch this week? (Y/N)
- Budget for deployment: ₹15,000-20,000 OK? (Y/N)

---

## AFTER LAUNCH (Week 2)

### Optional purchases to add:

**Week 3:**
- [ ] Buy External HDD (₹3,500) from Amazon
- [ ] Set up weekly backup automation

**Week 4:**
- [ ] Register Razorpay (FREE)
- [ ] I integrate payment gateway

**Month 2:**
- [ ] (Optional) Add SendGrid for newsletters
- [ ] (Optional) Upgrade to 4GB RAM if needed

---

## PAYMENT METHODS ACCEPTED BY GODADDY

**GoDaddy accepts:**
- ✅ Credit Card (Visa, Mastercard)
- ✅ Debit Card (VISA/Mastercard enabled)
- ✅ UPI (Google Pay, Paytm, PhonePe)
- ✅ Net Banking (ICICI, HDFC, Axis, etc.)
- ✅ Amazon Pay
- ✅ PayPal

**I recommend:** Credit/Debit card or UPI (instant payment, instant VPS activation)

---

## FINAL CHECKLIST

### BEFORE I START DEPLOYMENT:

```
[ ] ✅ Domain purchased on GoDaddy (clubskypark.com)
    └── Already done by you

[ ] 🔴 VPS purchased on GoDaddy (2GB RAM, ₹1,500/mo)
    └── YOU DO THIS TODAY
    └── Send me: IP, username, password, cPanel URL

[ ] ✅ External HDD purchased (₹3,500, optional)
    └── Buy this week (for backup)

[ ] ✅ Razorpay account (FREE, for Phase 2)
    └── Do this after launch

[ ] ✅ Confirmation email received from GoDaddy
    └── Save credentials securely
```

---

## BUDGET SUMMARY

**To launch this week:**
```
Mandatory:  GoDaddy VPS ₹1,500/month
Optional:   External HDD ₹3,500 (one-time)
Deployment: Claude's fee ₹15,000-20,000 (one-time)
──────────────────────────────
TOTAL:      ₹20,000-24,000 this week
            ₹1,500/month ongoing
```

**Is it worth it?**
- ✅ YES. You'll make this back in 2-3 bookings
- ✅ Full digital POS for your hotel
- ✅ Professional website at www.clubskypark.com
- ✅ 24/7 access from any device
- ✅ All data backed up and safe

---

## NEXT STEP

**Text me / Email me:**
```
✅ GoDaddy VPS purchased? 
   IP: _______________
   Username: _______________
   Password: _______________
   cPanel URL: _______________
   
✅ Ready to deploy this week?

✅ Any questions about purchases?
```

**Then I will:**
1. Connect to your VPS via SSH
2. Deploy backend API
3. Deploy frontend website
4. Deploy admin panel
5. Test everything
6. **Website LIVE in 5-7 days** 🚀

---

**Questions about what to buy? Ask now!**

**Ready to purchase? Go buy the GoDaddy VPS and send me the credentials.** ⚡

