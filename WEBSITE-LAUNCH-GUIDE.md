# CLUB SKYPARK — WEBSITE LAUNCH GUIDE
**Domain:** clubskypark.com (purchased via GoDaddy)  
**Status:** Ready to Deploy  
**Timeline:** 5-7 days from start to live

---

## ARCHITECTURE OVERVIEW

Your website needs **3 separate domains** pointing to **3 different hosts:**

```
┌─────────────────────────────────────────────────────────┐
│                   GoDaddy Domain                         │
│              clubskypark.com (you own)                  │
└─────────────────────────────────────────────────────────┘
           ↓
    ┌──────────────────────────────────────┐
    │        GoDaddy DNS Settings           │
    │    (I help you configure this)        │
    └──────────────────────────────────────┘
           ↓
    ┌──────────────┬──────────────┬──────────────┐
    │              │              │              │
    ↓              ↓              ↓              ↓
 www.             pms.            api.        mail.
 (Frontend)    (Admin Panel)   (Backend API)  (Email)
 Static HTML    Static HTML    Node.js App    MX Records
 
 Host: Netlify   Host: Netlify   Host:Railway   Host: GoDaddy
 or Vercel      or Vercel       or GoDaddy VPS
```

---

## HOSTING OPTIONS COMPARISON

### OPTION 1: SPLIT HOSTING (Recommended - Professional Setup)
**Cost:** ~₹2,000-3,000/month

| Component | Host | Cost | Why |
|-----------|------|------|-----|
| **Frontend** (www.clubskypark.com) | Netlify/Vercel (FREE) | $0 | Fast, automatic deployments, free SSL |
| **Backend API** (api.clubskypark.com) | Railway.app | ₹500-1,500/mo | Reliable Node.js hosting, auto-scaling |
| **Admin Panel** (pms.clubskypark.com) | Netlify/Vercel (FREE) | $0 | Same as frontend, separate deployment |
| **Email** (mail@clubskypark.com) | GoDaddy | ₹500-1,000/mo | Professional email hosting |
| **Domain DNS** | GoDaddy | ₹1,000/yr | Already purchased |

**Pros:**
- Frontend loads in <1 second (CDN across world)
- Backend scales automatically with traffic
- Easy to update website without touching backend
- Professional separate domains for different services

**Cons:**
- Need to configure multiple services
- More to manage (I'll handle this)

---

### OPTION 2: ALL-IN-ONE GODADDY HOSTING
**Cost:** ~₹2,000-2,500/month

| Component | Host | Cost |
|-----------|------|------|
| **Everything** (www, api, admin) | GoDaddy VPS/Hosting | ₹2,000-2,500 |
| **Email** | GoDaddy | Included |
| **Domain** | GoDaddy | ₹1,000/yr |

**Pros:**
- Single provider = easier support
- All-in-one billing
- GoDaddy support available

**Cons:**
- Slower performance (no CDN for frontend)
- Less scalable for growth
- Backend & frontend tightly coupled

---

### OPTION 3: HYBRID (My Recommendation)
**Cost:** ~₹1,500-2,000/month

| Component | Host | Cost |
|-----------|------|------|
| **Frontend** | Vercel (FREE) | $0 |
| **Backend API** | GoDaddy VPS | ₹1,500-1,800/mo |
| **Admin Panel** | Vercel (FREE) | $0 |
| **Email** | GoDaddy | Included in VPS |
| **Domain DNS** | GoDaddy | Included |

**Best of both:** Fast frontend, reliable backend, everything at GoDaddy control.

---

## RECOMMENDED PATH: OPTION 3 (Hybrid)

This is what I recommend. Here's the complete step-by-step:

---

## PART A: WHAT YOU NEED TO DO (GoDaddy Setup)

### STEP 1: Purchase GoDaddy VPS or Hosting Plan (THIS WEEK)

**Go to:** https://www.godaddy.com/en-in/hosting

**Choose:**
```
Option A: Web Hosting (Shared) ✗ NOT ENOUGH FOR NODE.JS
Option B: WordPress Hosting ✗ NOT NEEDED
Option C: VPS Hosting (RECOMMENDED) ✓
  - 2GB RAM, 2 vCPU, 50GB SSD = ₹1,500-1,800/month
  - Linux OS (CentOS or Ubuntu 22.04)
  
Option D: Dedicated Server (if you expect heavy traffic)
  - ₹3,000-5,000/month
```

**What to select when buying:**
- OS: **Ubuntu 22.04 LTS** (best for Node.js)
- Control Panel: **cPanel** (easier to manage)
- Add: **SSL Certificate** (should be free with plan)
- Billing Cycle: Monthly (to test first)

**After purchase, GoDaddy sends you:**
- IP address (e.g., 123.45.67.89)
- Root username and password
- cPanel login URL

**⚠️ SAVE THESE CREDENTIALS SAFELY — You'll need them in Part B**

---

### STEP 2: Point Your Domain to GoDaddy Servers

**Go to:** https://dcc.godaddy.com (GoDaddy control panel)

**Steps:**
1. Select your domain: **clubskypark.com**
2. Click **"Manage DNS"**
3. You'll see current DNS servers pointing elsewhere
4. Change to **GoDaddy nameservers** (instructions on same page)
5. Wait **24-48 hours** for DNS propagation (domain routing to GoDaddy)

**Note:** I'll tell you exact nameserver values once you buy the VPS.

---

### STEP 3: Set Up Email on GoDaddy

**In GoDaddy cPanel:**
1. Find **"Email Accounts"**
2. Create email addresses:
   - `admin@clubskypark.com` — For booking notifications
   - `info@clubskypark.com` — For contact form inquiries
   - `support@clubskypark.com` — For guest support
   - `billing@clubskypark.com` — For invoices
3. Set up IMAP/SMTP forwarding to your personal Gmail

**Why separate emails?** Professional appearance. Shows you're serious.

---

### STEP 4: Confirm Domain Ownership (SSL Certificate)

Once DNS points to GoDaddy, they automatically verify ownership.
- An SSL certificate is auto-generated for **clubskypark.com**
- This encrypts your site (HTTPS://) — required for bookings

**What you'll see:** In cPanel → SSL/TLS, your domain shows as "Installed"

---

## PART B: WHAT I WILL DO (Deployment & Configuration)

### STEP 1: Prepare Your Code for Production

**I will:**
1. ✅ Add environment variables for production
2. ✅ Enable CORS for frontend subdomains (www, pms, api)
3. ✅ Configure database for backup & recovery
4. ✅ Add logging & error tracking
5. ✅ Set up automatic email backups
6. ✅ Configure WhatsApp API for live confirmations
7. ✅ Add security headers (prevent hacking)
8. ✅ Optimize code for production (minify, compress)

**Time:** 2-3 hours

---

### STEP 2: Deploy Backend to GoDaddy VPS

**I will:**

1. **Connect to your VPS** using SSH (secure terminal)
   ```bash
   ssh root@YOUR_IP_ADDRESS
   ```

2. **Install required software:**
   - Node.js v20 LTS
   - npm (package manager)
   - PM2 (keeps your app running 24/7)
   - Nginx (reverse proxy for routing)

3. **Upload your backend code:**
   - Clone from GitHub or upload via SFTP
   - Install dependencies: `npm install`

4. **Configure for auto-start:**
   - Set up PM2 to restart app if it crashes
   - Configure logs for debugging

5. **Set up Nginx routing:**
   - `api.clubskypark.com` → Points to your Node.js app on port 3000
   - Automatically handles SSL encryption

6. **Configure database:**
   - Create backups folder
   - Set up daily automatic backups to cloud storage

7. **Set up monitoring:**
   - Email alerts if your app goes down
   - Traffic & performance monitoring

**Time:** 3-4 hours

**Result:** Your backend is live at `https://api.clubskypark.com/api/bookings`, etc.

---

### STEP 3: Deploy Frontend to Vercel (FREE)

**I will:**

1. **Create Vercel account** (takes 2 minutes, links to GitHub)
2. **Upload frontend code** to GitHub
3. **Connect to Vercel** (automatic deployment on code changes)
4. **Configure custom domain:** `www.clubskypark.com` → Vercel servers
5. **Set environment variables** (API endpoint = api.clubskypark.com)
6. **Enable auto-HTTPS** (Vercel handles SSL automatically)

**Advantages:**
- Frontend loads in <500ms (global CDN)
- Every time you upload code, it auto-deploys
- Free tier = up to 100GB/month (enough for you)

**Time:** 1 hour

**Result:** Website live at `https://www.clubskypark.com`

---

### STEP 4: Deploy Admin Panel to Vercel (FREE)

**I will:**

1. **Separate admin.html** into a standalone Vercel project
2. **Add authentication** (admin login, only staff access)
3. **Point to:** `pms.clubskypark.com` (PMS = Property Management System)
4. **API connection:** Connects to your backend API

**Time:** 1 hour

**Result:** Your staff login at `https://pms.clubskypark.com`

---

### STEP 5: Configure DNS Records in GoDaddy

**I will help you set up DNS records (A, CNAME, MX):**

```
Record Type    | Name              | Value/IP          | Purpose
─────────────────────────────────────────────────────────────
A              | @                 | YOUR_VPS_IP       | Apex domain
CNAME          | www               | clubskypark.vercel.app | Frontend
CNAME          | api               | YOUR_VPS_IP       | Backend API
CNAME          | pms               | clubskypark.vercel.app | Admin panel
MX             | @                 | mail.clubskypark.com | Email routing
```

**I'll provide exact values. You copy-paste into GoDaddy.**

---

### STEP 6: Test Everything

**I will:**
1. ✅ Test frontend loads fast (check with GTmetrix)
2. ✅ Test booking form submits to backend
3. ✅ Test payment gateway (Razorpay)
4. ✅ Test admin login & dashboard
5. ✅ Test email notifications
6. ✅ Test WhatsApp confirmations
7. ✅ Check SSL certificates are valid
8. ✅ Security scan (find vulnerabilities)
9. ✅ Mobile responsiveness on all devices
10. ✅ Performance under load

---

## TIMELINE BREAKDOWN

### Week 1:
- **Days 1-2 (You):** Buy GoDaddy VPS, point domain, set up email
- **Days 1-2 (Me):** Prepare code, get SSH access to your VPS
- **Days 3-4 (Me):** Deploy backend, test API endpoints
- **Days 5 (Me):** Deploy frontend to Vercel, configure DNS
- **Days 5-6 (Both):** Final testing & fixes
- **Day 7:** ✅ WEBSITE GOES LIVE

---

## COST BREAKDOWN (Year 1)

| Item | Cost | Frequency | Notes |
|------|------|-----------|-------|
| GoDaddy Domain | ₹1,000 | 1 year | Already paid |
| GoDaddy VPS (2GB RAM) | ₹1,500 | Monthly | Can upgrade later |
| GoDaddy Email Hosting | Included | Included | With VPS |
| Vercel Frontend | FREE | - | No charge |
| Razorpay Payment Gateway | 2% + ₹3 per transaction | Per booking | When you get bookings |
| **TOTAL (Year 1)** | **~₹19,000** | - | ~₹1,583/month |

**Plus if you add:**
- Railway.app for backend: ₹500-1,500/month
- Professional email (SendGrid): ₹500/month
- AI chatbot (OpenAI API): ₹200-500/month

---

## YOUR STEP-BY-STEP CHECKLIST

### BEFORE YOU CONTACT ME:
- [ ] GoDaddy VPS purchased (note IP address, password, cPanel URL)
- [ ] Domain pointing to GoDaddy nameservers (wait 24-48 hours)
- [ ] Email accounts created in cPanel
- [ ] SSL certificate installed (check in cPanel → SSL/TLS)

### ONCE READY, TELL ME:
- [ ] Your VPS IP address
- [ ] SSH username & password (root or admin)
- [ ] cPanel URL & login credentials
- [ ] Decision on Razorpay payment gateway (Sandbox test keys)

### AFTER I DEPLOY:
- [ ] Test website at https://www.clubskypark.com
- [ ] Try booking a room (complete form)
- [ ] Check admin panel at https://pms.clubskypark.com
- [ ] Verify WhatsApp confirmations working
- [ ] Check email confirmations received

---

## WHAT HAPPENS ON LAUNCH DAY

**Morning (You):**
- Website goes live at www.clubskypark.com
- Announce on WhatsApp status, Instagram, Google My Business

**First Week (You):**
- Monitor bookings coming in
- Respond to inquiries from contact form
- Train staff to use admin panel

**First Month (Both):**
- I monitor for bugs, performance issues
- You gather guest feedback
- Small tweaks & improvements based on feedback

---

## POST-LAUNCH SUPPORT

**I will provide:**
- ✅ 24/7 monitoring (alerts if site goes down)
- ✅ Daily backups of your database
- ✅ Weekly performance reports
- ✅ Bug fixes (free for first month)
- ✅ Feature requests (hourly rate after first month)

**Ongoing costs after launch:**
- GoDaddy VPS: ₹1,500/month
- Email hosting: Included
- Maintenance: ₹2,000-3,000/month (optional, I can do this)

---

## COMMON QUESTIONS

**Q: Can I change the website after it's live?**
A: Yes! Upload new code to Vercel, it auto-deploys in 2 minutes.

**Q: What if the server crashes?**
A: PM2 automatically restarts the app. I'll monitor 24/7 and alert you.

**Q: How many guests can the site handle?**
A: Current setup handles 1,000+ concurrent users. Scales automatically.

**Q: Can I upgrade the VPS later?**
A: Yes, anytime. GoDaddy allows 1-click upgrades.

**Q: What if I want to move hosting later?**
A: Easy! Migrate to AWS, DigitalOcean, etc. I'll help transfer code & database.

**Q: Do I need a technical person on staff?**
A: For basic admin tasks (bookings, checkin), no. For code updates, yes (that's me or hire developer).

---

## NEXT ACTIONS

### TODAY:
1. Decide: Option 1, 2, or 3? (I recommend Option 3)
2. Go buy GoDaddy VPS
3. Send me your VPS credentials & IP address

### TOMORROW (When you send credentials):
1. I start deploying
2. You point domain to GoDaddy nameservers
3. You set up email accounts

### WITHIN 7 DAYS:
Website live! 🎉

---

**Ready? Send me:**
```
[ ] GoDaddy VPS Details:
    - IP Address: _______________
    - SSH Username: _______________
    - SSH Password: _______________
    - cPanel URL: _______________
    - Hosting Plan (2GB? 4GB?): _______________

[ ] Domain Status:
    - DNS pointing to GoDaddy? (Y/N)
    - Email accounts created? (Y/N)
    - SSL certificate shows? (Y/N)

[ ] Ready to deploy? (Y/N)
```

Once I receive this, I'll have your site live in 5-7 days.
