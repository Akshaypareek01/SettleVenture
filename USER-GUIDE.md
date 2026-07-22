# ApexLedger — End-to-End User Guide

Partner investment & expense tracker for shared ventures (truck, car, plot, jamin, company, etc.). Replaces the Excel flow: **money in → project bank → money out**, plus direct expenses, EMI, earnings, invoices/GST, and fair-share settlement.

---

## 1. Quick start (local)

```bash
# From repo root
npm install
# Ensure MongoDB is running at mongodb://localhost:27017
cp apps/api/.env.example apps/api/.env   # edit if needed
cp apps/web/.env.example apps/web/.env   # optional

npm run seed    # demo users + Truck 1 / Car 1
npm run dev     # API :4000 + Web :5173
```

Open **http://localhost:5173** → Login.

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@apexledger.local` | `Admin123!` |
| Partner | `partner1@apexledger.local` | `Partner123!` |
| Partner | `partner2@apexledger.local` | `Partner123!` |
| Partner | `partner3@apexledger.local` | `Partner123!` |

No public signup — admin creates accounts.

---

## 2. Money model (entire flow)

```
┌─────────────┐     Partner Investment      ┌──────────────────┐
│  Partner's  │ ──────────────────────────► │  Project bank    │
│  pocket     │                             │  account(s)      │
└─────────────┘                             └────────┬─────────┘
       │                                             │
       │ Direct Expense                    Bank outflow / EMI from bank
       │ (not through bank)                          │
       ▼                                             ▼
  Still counts toward                    Vendor / diesel / fees / EMI
  that partner's "contributed"           (reduces pool + bank balance)
```

**Also in the system:**

| Flow | What it does |
|------|----------------|
| **Earning** | Revenue deposited into a project bank (increases bank cash; does **not** change fair-share settlement) |
| **EMI (personal)** | Partner pays EMI from own pocket (tracked on EMI board; not pool, not fair share) |
| **EMI from bank** | Project bank pays EMI for a partner (bank out + pool out; credited to beneficiary on EMI board) |

**Settlement (fair share)** only uses:

`totalContributed = Partner Investments + Direct Expenses`

`fairShare = sum(all partners' totalContributed) / partnerCount`  
`netBalance = your contributed − fairShare`

- Positive → group owes you (`owed_by_group`)
- Negative → you owe the group (`owes_group`)

Earnings, bank outflows, and EMI personal do **not** enter that fair-share formula.

---

## 3. Roles

### Partner
- Sees only projects they’ve been **assigned** to
- Can add entries, upload proof, view bank / earnings / EMI / invoices / GST / documents / analysis
- Sees own total investment on home + sidebar
- Can open per-partner analytics / CSV for themselves (and others on the project, depending on UI links)
- **Cannot** see the admin settlement table on Analysis (admin-only), manage users, or create projects

### Admin
- Everything partners can do, plus **Admin** panel
- Create/deactivate users, venture types, projects, bank accounts
- Assign partners to projects
- Company profile (for invoices / GST)
- Full settlement view on Analysis

---

## 4. Partner journey (step by step)

### A. Login → My Projects
1. Go to `/login`, sign in.
2. Land on **My Projects** (`/app`) — grid of assigned ventures.
3. Search / filter by type (Truck, Car, …) and status (partners: active only).
4. Click a project card → opens that venture.

### B. Inside a project
Header shows: total contributed, investment, direct expenses, pool balance, earnings, bank cash.

**Tabs (secondary nav):**

| Tab | What partners do |
|-----|------------------|
| **Entries** | Add money movements; list all / my history |
| **Bank** | Per-account cashbook (in / out / balance) |
| **Earnings** | Focused view + add earnings |
| **EMI** | Who’s on EMI, what’s paid this period, log EMI |
| **Invoices** | Create draft invoices, open detail |
| **GST** | GST summary for the project |
| **Documents** | All attachments / proofs for the venture |
| **Analysis** | KPIs, partner breakdown, charts (settlement table = admin) |

### C. Add an entry (main partner action)
**Entries → + Add Entry**

Pick **entry type**, then fill fields that appear for that type. **Proof file is required** (receipt / screenshot).

| Option (UI label) | Type code | Typical fields | Effect |
|-------------------|-----------|----------------|--------|
| **Partner Investment** | `CONTRIBUTION_IN` | Amount, date, **bank account**, paid from, remark, file | ↑ pool in, ↑ bank, ↑ your contributed |
| **Direct Expense** | `EXPENSE` | Amount, date, paid from/to, remark, file | ↑ your contributed only (no bank) |
| **Bank outflow** | `VENDOR_PAYMENT_OUT` | Amount, date, **bank**, **category**, paid to, remark, file | ↓ pool, ↓ bank |
| **Earning** | `EARNING_IN` | Amount, date, **bank**, remark, file | ↑ earnings, ↑ bank (not fair share) |
| **EMI (personal)** | `EMI_PERSONAL` | Amount, date, **EMI period**, remark, file | EMI board only |
| **EMI from bank** | `EMI_FROM_BANK` | Amount, date, **bank**, **beneficiary partner**, EMI period, remark, file | ↓ bank/pool + EMI board for beneficiary |

After save → summary refreshes; you’re sent to **All Entries**.

**Entries sub-tabs:**
- **+ Add Entry** — form above  
- **All Entries** — full project ledger (filterable)  
- **My History** — only your rows  

### D. Bank tab
- List of project bank accounts with running balance  
- Drill into one account → ledger for that account only  
- Balances come from Investments + Earnings − Outflows − EMI-from-bank  

### E. Earnings / EMI shortcuts
Same add form, often **preset** to Earning or EMI so you don’t hunt for the type.

### F. Invoices & GST
1. Admin should set **Company** profile (GSTIN, address, etc.) once.  
2. Partners: **Invoices → create draft** (customer, lines, GST %, intra/inter-state).  
3. Open invoice detail for totals / status.  
4. **GST** tab = aggregated GST view for the project.

### G. Documents
All uploaded proofs across entries — preview / download (and delete if allowed by API rules).

### H. Analysis + partner drill-down
- Charts: contribution %, category spend, pool KPIs  
- Click a partner → `/app/project/:id/partner/:partnerId`  
  - Their investments, expenses, earnings, EMI totals  
  - Entry log with attachments  
  - Settlement snapshot  
  - **Download CSV** report  

---

## 5. Admin journey (setup flow)

**Sidebar → Admin** (`/app/admin`)

Recommended order:

```
1. Types     → ensure Truck / Car / Plot / … exist (seed creates these)
2. Users     → create partners (email + password)
3. Company   → legal name, GSTIN, address (for invoices)
4. Projects  → create venture + bank accounts (HDFC Ops, SBI Pool, …)
5. Assign    → link partners to that project
```

Then partners log in and only see what they’re assigned to.

**Admin tabs:**

| Tab | Actions |
|-----|---------|
| **Users** | Create partners/admins; activate/deactivate |
| **Types** | Venture type labels, icons, colors |
| **Projects** | Create/edit/close projects; bank account editor |
| **Assign Partners** | Attach/detach partners ↔ projects |
| **Company** | Company profile for invoicing |

Admins also see **all** projects on My Projects (incl. closed) and the **settlement table** on Analysis.

---

## 6. End-to-end example (Truck 1)

1. Admin creates **Truck 1**, adds **HDFC Ops** + **SBI Pool**, assigns Akshay / Rahul / Priya.  
2. Akshay logs in → opens Truck 1 → **Entries → Partner Investment** ₹2,80,000 into HDFC Ops + uploads UPI screenshot.  
3. Rahul adds **Direct Expense** ₹1,565 (tool from pocket).  
4. Priya logs **Bank outflow** ₹50,000 diesel from HDFC Ops, category Diesel.  
5. Driver trip → **Earning** ₹12,000 into HDFC Ops.  
6. Month EMI: Akshay **EMI (personal)** or bank pays via **EMI from bank** for Akshay.  
7. Customer job → **Invoice** draft + check **GST**.  
8. Everyone opens **Analysis** / partner page to see who is ahead/behind on fair share; admin uses settlement to settle cash between partners.

---

## 7. What each partner option is *for* (cheat sheet)

| When you… | Choose |
|-----------|--------|
| Put personal money into the project bank | **Partner Investment** |
| Paid a project cost yourself (no bank transfer) | **Direct Expense** |
| Paid vendor / diesel / fee **from** project bank | **Bank outflow** |
| Got revenue into project bank | **Earning** |
| You paid the loan EMI yourself | **EMI (personal)** |
| Project bank paid someone’s EMI | **EMI from bank** (pick beneficiary) |

---

## 8. App map (routes)

| Path | Who | Purpose |
|------|-----|---------|
| `/` | Public | Landing |
| `/login` | Public | Auth |
| `/app` | Authed | My Projects |
| `/app/project/:id/entries` | Assigned | Ledger + add |
| `/app/project/:id/bank` | Assigned | Cashbook |
| `/app/project/:id/earnings` | Assigned | Earnings |
| `/app/project/:id/emi` | Assigned | EMI board |
| `/app/project/:id/invoices` | Assigned | Invoices |
| `/app/project/:id/gst` | Assigned | GST |
| `/app/project/:id/documents` | Assigned | Files |
| `/app/project/:id/analysis` | Assigned | KPIs (+ settlement if admin) |
| `/app/project/:id/partner/:partnerId` | Assigned | Partner analytics + CSV |
| `/app/admin/users` | Admin | Create / deactivate users |
| `/app/admin/types` | Admin | Venture types |
| `/app/admin/projects` | Admin | Create / edit projects |
| `/app/admin/assign` | Admin | Assign partners |
| `/app/admin/company` | Admin | Company profile for invoicing |

---

## 9. Ops notes

- **Files:** R2 if configured; else local `apps/api/uploads/`. Max size from `MAX_FILE_SIZE_MB`.  
- **Auth:** JWT cookie; logout from sidebar.  
- **Seed** wipes demo collections — don’t run against production data.

---

## 10. Mental model in one line

**Partners log money in/out of shared projects; ApexLedger keeps the bank cashbook, proofs, EMI, invoices/GST, and fair-share settlement so nobody needs the Excel again.**
