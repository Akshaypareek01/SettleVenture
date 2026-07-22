# ApexLedger — Production Readiness: Flow Fixes & Optimization Plan

> Scope: **India-only** business use (INR, GST, Indian banking). No payment gateway.
> This is pure management software — partners + admin tracking money in/out of shared
> ventures. This doc lists what is wrong or missing in the current build, what must be
> fixed before real business data goes in, and how to optimize the flows, dashboard,
> KPIs, and loading.

---

## 1. What we are building (recap of the flow)

```
Admin setup:  Types → Users → Company profile → Projects (+ bank accounts) → Assign partners
Partner use:  Login → My Projects → open project →
              Entries (add money movements + proof) → Bank cashbook → Earnings →
              EMI board → Invoices → GST → Documents → Analysis (KPIs + settlement)
Money model:  Partner Investment ↑pool ↑bank ↑contributed
              Direct Expense     ↑contributed only
              Bank Outflow       ↓pool ↓bank
              Earning            ↑bank (not fair share)
              EMI personal       EMI board only
              EMI from bank      ↓bank ↓pool + EMI board
Settlement:   fairShare = Σ contributed / partnerCount ; net = contributed − fairShare
```

The logic is right. The problems are in **correctness under real use, missing business
flows (email, Excel, proper invoice print), data-loading efficiency, and the entry
dashboard experience**.

---

## 2. CRITICAL correctness fixes (do these first — real money depends on them)

### 2.1 Bank balance race condition → overdrafts possible
`apps/api/src/utils/bankBalance.ts` — `assertSufficientBankBalance()` reads the balance,
then the caller writes the transaction later. Two partners submitting outflows at the
same moment **both pass the check** and the account goes negative.

**Fix:** run the balance check + transaction insert inside a MongoDB session/transaction,
or maintain a `currentBalance` field on the bank-account subdocument updated with a
conditional atomic op (`findOneAndUpdate` with `balance: { $gte: amount }` guard).

### 2.2 Balance computed by loading every transaction into JS
`getBankAccountBalance()` does `Transaction.find(...)` and sums in a loop. It runs on
**every outflow and every bank-page load**, and gets slower forever as the ledger grows.

**Fix:** one MongoDB aggregation (`$match` + `$group` with `$cond` on type), and/or a
maintained running balance per account (recomputed by a nightly consistency job).

### 2.3 `markInvoicePaid` is not atomic
`apps/api/src/services/invoice.service.ts:231-255` — creates the `EARNING_IN`
transaction, then updates attachments, then saves the invoice as three separate writes.
A crash in between leaves an earning with no paid invoice (or vice-versa) — the bank
cashbook and GST report silently disagree.

**Fix:** wrap in `mongoose.startSession()` + `withTransaction()`. Same treatment for
every multi-write flow (entry create + attachment link, cascade deletes).

### 2.4 Invoice numbers get burned / no financial-year series
`allocateInvoiceNumber()` (invoice.service.ts:145) `$inc`s the counter **before** the
invoice is successfully issued — any failure after allocation permanently skips a
number. GST expects a **consecutive serial number series per financial year**
(e.g. `AL/2025-26/0001`), and the current scheme is one global `AL-0001` counter with
no FY reset and no gap protection.

**Fix:** allocate the number inside the same DB transaction as the issue operation;
number format `PREFIX/FY/SEQ`; reset sequence each FY (Apr–Mar); keep cancelled
invoices in the series (status `cancelled`, never deleted).

### 2.5 Bank accounts replaced wholesale on edit
`apps/api/src/utils/bankAccounts.ts` — `mapBankAccounts()` rebuilds the subdocument
array from the client payload. Removing an account from the admin editor can orphan
every transaction that references its `bankAccountId`.

**Fix:** never delete an account that has transactions — only `isActive: false`
(deactivate). Server must enforce this, not the UI.

---

## 3. Invoice format & PRINT — not usable for a real Indian business yet

What exists: a styled on-screen invoice card + `window.print()`
(`apps/web/src/pages/project/ProjectInvoiceDetailPage.tsx:114,163-246`).

Problems and the fixes:

| # | Problem | Fix |
|---|---------|-----|
| 1 | **Dark theme prints as-is** — dark card, light text; wastes ink, looks wrong, some printers render it unreadable | Dedicated print stylesheet: `@media print` forces white background, black text, clean A4 layout with margins — or a separate `/print` route rendering a light-only invoice template |
| 2 | **Not a legal GST tax invoice** — missing: "TAX INVOICE" title, HSN/SAC code per line, place of supply + state code, per-line GST rate, reverse-charge declaration, authorised signatory block | Extend the invoice model with `hsnSac`, `gstRate` **per line item**, `placeOfSupply`, `stateCode`; render all mandatory fields per CGST Rule 46 |
| 3 | **Single GST rate for whole invoice** (`computeInvoiceMoney` takes one `gstRate`) — can't invoice 5% transport + 18% service together | Move GST rate (and HSN) to the line item; compute CGST/SGST/IGST per line, sum |
| 4 | **Inter-state is a manual checkbox** — humans will get it wrong | Derive from GSTIN state codes: first 2 digits of company GSTIN vs customer GSTIN / place of supply. Keep manual override only for edge cases |
| 5 | **No "Amount in words"** — expected on every Indian invoice | Add rupees-in-words helper (Indian numbering: lakh/crore) |
| 6 | **No PDF** — print-only means no file to WhatsApp/email a customer | Server-side PDF generation (puppeteer or pdfkit) → `GET /api/invoices/:id/pdf`. This also becomes the email attachment (§5) |
| 7 | **No copy labels** — "Original for Recipient / Duplicate for Transporter / Triplicate for Supplier" where relevant | Optional copy-type label on the print template |
| 8 | **No partial payment / TDS** — `markInvoicePaid` books the full `totalAmount` as one earning | Support amount-received + TDS-deducted fields; book earning at actual received amount, track balance due on the invoice |

Also: `computeGstSummary` buckets by **UTC month** (invoice.service.ts:310) — an
invoice issued 1 Apr 00:30 IST lands in March. Use IST (`Asia/Kolkata`) when deriving
the GST period, since GSTR filings are IST-month based.

---

## 4. Bank management flow — missing pieces

1. **No bank-to-bank transfer type.** Moving money HDFC Ops → SBI Pool currently
   requires a fake outflow + fake investment, which corrupts both pool totals and
   partner contributions. Add a `TRANSFER` transaction type (one txn, `fromAccountId`
   + `toAccountId`, affects both cashbooks, affects **no** partner/settlement math).
2. **No opening balance.** Real accounts start with money in them. Add
   `openingBalance` + `openingDate` per bank account; ledger and balance math start
   from there.
3. **No reconciliation.** Add a simple monthly "reconcile" flow: enter the real bank
   statement closing balance, app shows the difference vs computed balance, unmatched
   entries get flagged. This is what makes people trust the numbers.
4. **Cashbook needs running balance per row** (like a passbook), server-computed in the
   same aggregation, not client-side.
5. **Deactivation guard** (see §2.5) + show inactive accounts greyed-out with history
   intact.

---

## 5. Email flow — completely missing (grep confirms: no mail library anywhere)

Nothing sends email today: no invites, no password reset, nothing. Minimum viable email
layer for this business:

| Email | Trigger |
|-------|---------|
| **Account invite** with set-password link | Admin creates a user (today the admin types a password and must WhatsApp it — insecure) |
| **Password reset** | "Forgot password" on login (doesn't exist today — a locked-out partner needs the admin + DB access) |
| **Invoice PDF to customer** | "Send invoice" button on invoice detail (uses the PDF from §3.6) |
| **Large-entry alert** (optional) | Entry above a configurable amount → other partners notified |
| **Monthly summary** (optional) | 1st of month: each partner gets pool balance, their contributed, net settlement position |

Implementation: `nodemailer` + any SMTP (Zoho/Google Workspace you already have, or
SES). One `email.service.ts` with typed templates, fire-and-forget with retry (a failed
email must never fail the API request). Add `SMTP_*` vars to `.env.example` and env
validation.

---

## 6. Excel flow — missing (planned in PROJECT-PLAN §9, never built)

The whole point was replacing an Excel tracker, so both directions matter:

**Import (one-time migration + ongoing bulk add):**
- Admin uploads `.xlsx` → server parses with `exceljs`/`xlsx` (never trust
  client-parsed data) → column-mapping step (Date / Type / Partner / Amount / Bank /
  Category / Remark) → **validation preview screen** (row-level errors: unknown
  partner, bad date, negative amount, unknown bank) → confirm → rows inserted in one
  DB transaction, tagged with an `importBatchId` so a bad import can be rolled back as
  a unit.

**Export (accountant/CA handoff — this is what gets asked for at tax time):**
- Per project: full ledger, bank cashbook, GST register (invoice-wise, matches GSTR-1
  columns), settlement statement — as `.xlsx` with formatted headers, and date-range
  filters. The CSV that exists today (`partner-analytics.service.ts`) covers only one
  partner's view; extend to these project-level exports.

---

## 7. Starting dashboard — straight-forward summary first, detail on demand

Today login lands on a **project-card grid** with no numbers overview; every KPI lives
inside a project. For "open the app, know where we stand in 5 seconds," add a real
**Home dashboard** at `/app`:

**Row 1 — 4 KPI cards (whole business, all my projects):**
Total pool balance (all banks) · My total contributed · My net settlement position
(owed / owes, coloured) · This month's in vs out.

**Row 2 — Projects table (one row per assigned project):**
name/type · pool balance · my contributed · my net position · last activity date →
click = straight into that project's Entries. (Keep the card grid as a secondary
view if liked, but the table is the workhorse.)

**Row 3 — Recent activity (last 8–10 entries across projects)** with who/what/amount —
this doubles as passive review of what other partners logged.

**Rules to keep it clean (applies to every page):**
- One number per card, label + value + small trend/sub-line. No decimals on big INR
  amounts (`₹2.8L` style short format above 1 lakh).
- Max 2 charts visible per screen; everything else behind the Analysis tab.
- Charts that earn their place: partner contribution share (donut), monthly in/out
  (grouped bars), category spend (horizontal bars, top 8 + "other"). Drop anything
  that just restates a table.
- Empty states everywhere ("No entries yet — Add your first entry") instead of blank
  tables.

**Backend for it:** one endpoint — `GET /api/dashboard/summary` — returning all of the
above in a single response built from MongoDB aggregations. **Never** ship the pattern
"fetch all transactions, compute KPIs in the browser."

---

## 8. Loading & performance optimization

1. **Server-side aggregation everywhere.** Every KPI/summary/balance currently at risk
   of being computed by fetching full transaction lists (confirmed for bank balances,
   §2.2, and GST summary which `find()`s all invoices then loops). Convert to
   aggregation pipelines.
2. **Indexes** to match query patterns: `Transaction {ventureId, date}`,
   `{ventureId, bankAccountId, isDeleted}`, `{ventureId, type}`, `{partnerId, date}`;
   `Invoice {ventureId, status, issueDate}`; `Attachment {ventureId, transactionId}`.
   Verify with `.explain()` on the top 5 queries.
3. **One request per page load.** Each project page should hydrate from a single
   consolidated endpoint (header KPIs + first page of its list), not 3–5 sequential
   fetches (waterfall). Audit each page's network tab.
4. **Client caching:** adopt TanStack Query — cache per (project, tab), background
   refetch, and **targeted invalidation on mutation** (adding an entry invalidates
   that project's summary + entries list only, not a full-app refetch).
5. **Route-level code splitting:** `React.lazy` per page (admin pages, invoice detail,
   analysis with Recharts). Recharts alone is heavy — it must not be in the login/home
   bundle. Check with `vite build` + bundle visualizer.
6. **Skeleton loaders** for KPI cards and tables (not spinners, not layout jumps), and
   a visible error + retry state on every fetch.
7. **Pagination is server-side always** — entries, documents, audit — with sensible
   default page size (25) and filters passed as query params.
8. **Images/proofs:** thumbnails for the Documents grid (generate on upload or use
   small presigned variants) — never load full-size receipt photos in a grid.

---

## 9. Production readiness checklist (beyond flows)

- [ ] **Mongo transactions** for all multi-write flows (needs replica-set mode — one
      config flag on Atlas/self-hosted; document it).
- [ ] **Timezone policy:** store UTC, display + bucket reports in IST. Fix GST month
      bucketing (§3) and any `new Date(dateOnlyString)` boundary handling.
- [ ] **Money as Decimal128 end-to-end** — audit every place amounts round-trip
      through JS floats (`toNumber` in summaries is acceptable for display, not for
      stored derived values).
- [ ] **Auth hardening:** short-lived JWT + refresh, httpOnly secure cookie,
      rate-limit login, password reset flow (§5), account lockout after N failures.
- [ ] **Validation at the API edge** (zod on every route body/query — partially
      present, make it universal).
- [ ] **Audit log completeness:** every create/update/delete of transactions,
      invoices, bank accounts, assignments writes an audit row — verify no mutating
      endpoint skips it.
- [ ] **Soft-delete only** for anything with money history; hard delete admin-only
      and audited.
- [ ] **Backups:** daily automated Mongo dump + R2 bucket versioning; test one
      restore before go-live.
- [ ] **Env validation on boot** (fail fast if JWT secret/DB URL/SMTP missing),
      no default/dev secrets in production.
- [ ] **Logging & errors:** structured logs (pino), central error handler that never
      leaks stack traces to clients, uptime monitor on `/api/health`.
- [ ] **Seed safety:** seed script must refuse to run when `NODE_ENV=production`
      (it currently wipes collections).
- [ ] **HTTPS + helmet + CORS locked to the real domain.**

---

## 10. Suggested order of work

| Phase | Content | Why first |
|-------|---------|-----------|
| **1. Money correctness** | §2 all items + Mongo transactions + indexes | Nothing else matters if balances can be wrong |
| **2. Invoice/GST compliance** | §3 print template, FY numbering, per-line HSN/GST, PDF | Legal requirement the moment a real invoice is issued |
| **3. Bank flow completion** | §4 transfers, opening balance, running balance, reconcile | Makes the cashbook trustworthy day-to-day |
| **4. Home dashboard + loading** | §7 + §8 | The daily-use experience |
| **5. Email + Excel** | §5 + §6 | Onboarding, customer-facing invoices, CA handoff |
| **6. Hardening** | §9 checklist | Before real data / real users |

---

*Generated 22 Jul 2026. Sections 2–4 findings verified directly in code; file:line
references point at the exact spots to change.*
