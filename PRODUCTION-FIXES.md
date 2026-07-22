# ApexLedger — Production Readiness: Flow Fixes & Optimization Plan

> Scope: **India business use** (INR, GST, Indian banking — no i18n/multi-currency
> needed). No payment gateway. Pure management software: partners + admin tracking
> money in/out of shared ventures. This doc is the result of a full code audit
> (backend + frontend) and lists what is wrong or missing, what must be fixed before
> real business data goes in, and how to optimize the flows, dashboard, KPIs, and
> loading. File:line references point at the exact code.

---

## 1. What we are building (recap of the flow)

```
Admin setup:  Types → Users → Company profile → Projects (+ bank accounts) → Assign partners
Partner use:  Login → My Projects → open project →
              Entries (add money + proof) → Bank cashbook → Earnings →
              EMI board → Invoices → GST → Documents → Analysis (KPIs + settlement)
Money model:  Partner Investment ↑pool ↑bank ↑contributed
              Direct Expense     ↑contributed only
              Bank Outflow       ↓pool ↓bank
              Earning            ↑bank (not fair share)
              EMI personal       EMI board only
              EMI from bank      ↓bank ↓pool + EMI board
Settlement:   fairShare = Σ contributed / partnerCount ; net = contributed − fairShare
```

The business logic design is right. The problems are: **security holes, money-math
correctness under real use, missing business flows (email, Excel, proper invoice
print), inefficient data loading, and an entry experience with no dashboard.**

---

## 2. CRITICAL security fixes — ✅ DONE (22 Jul 2026)

> Correction: the originally-reported "path traversal via `GET /files/local/*`" does
> **not** exist in the current code — there is no local file serving; storage is
> R2-only (`r2.service.ts`). Verified by direct read. The remaining findings were
> real and are now fixed:

1. ✅ **`POST /files/confirm` trusted client-controlled `r2Key`/`fileType`/`fileSizeBytes`.**
   A forged `r2Key` could register an attachment pointing at another venture's
   object (and deleting it would delete that other venture's file from R2).
   **Fixed:** `r2Key` must match this venture's `ventures/{id}/proofs/…` pattern
   (no `..`/`\`), MIME restricted to the allowlist enum, size bounded by
   `MAX_FILE_SIZE_MB`, ObjectId-validated ids, duplicate-`r2Key` rejected (409).
   `/presign` now also enforces the MIME allowlist.

2. ✅ **No helmet, rate limiting only on login.**
   **Fixed:** `helmet()` on the app, global `/api` limiter (1000/15min/IP),
   upload/presign limiter (120/15min/IP), `trust proxy` set for correct IPs behind
   a reverse proxy.

3. ✅ **JWT hardcoded 7d expiry ignoring `JWT_EXPIRES_IN`; weak secret allowed.**
   **Fixed:** expiry from env, issuer `apexledger` + HS256 pinned on sign/verify;
   production boot now hard-fails on a <32-char or placeholder `JWT_SECRET` or a
   localhost `MONGODB_URI` (`env.ts`). *(Refresh-token rotation still future work.)*

4. ✅ **Any admin could reset another admin's password / deactivate admins.**
   **Fixed:** admin accounts are only modifiable by their owner
   (`admin.routes.ts` PATCH guard). Password policy raised to 8+ chars with a
   letter and a number (create + update).

5. ✅ **Error handler leaked internals and guessed status by substring.**
   **Fixed:** typed `AppError`, full zod field errors, generic 500 message in
   production; also added `express-async-errors` so Express 4 async route
   rejections reach the handler instead of hanging requests.

6. ✅ **Admin could create a transaction with an arbitrary `partnerId`** —
   now ObjectId-validated and must be assigned to the venture
   (`transactions.routes.ts`).

7. ✅ **Ops wins done alongside:** health check now reports real Mongo state
   (503 when disconnected), graceful SIGTERM/SIGINT shutdown with forced exit
   fallback, seed script refuses to run when `NODE_ENV=production`.

**Still open (deliberately deferred):**
- Plaintext password shown in the admin UI banner (`AdminPage.tsx:180`) — dies
  naturally with invite/reset emails (§6).
- Magic-byte sniffing of uploads (client MIME still trusted on `/upload`).
- Refresh-token/session revocation.

---

## 3. CRITICAL money-correctness fixes — ✅ DONE (22 Jul 2026)

> Infrastructure: local MongoDB converted to a single-node replica set (`rs0`) so
> `withTxn()` transactions work; `MONGODB_URI` now carries `?replicaSet=rs0`. Use
> Atlas (replica set by default) in production. A boot migration
> (`config/migrate.ts`) collapses duplicate company profiles and syncs indexes.
>
> All items below were implemented and verified end-to-end against the running API:
> - Overdraft of ₹9,99,999 against a ₹3,20,000 balance → correctly rejected;
>   a valid ₹5,000 outflow committed and the balance moved to ₹3,15,000.
> - Invoice issue produced `AL/2026-27/0001` then `0002` (FY series), GST split
>   CGST ₹4,500 + SGST ₹4,500 on a ₹50,000 line.
> - Mark-paid created the linked earning atomically and moved the bank balance;
>   voiding that earning was blocked with a clear message.
> - Settlement (now aggregation-based) nets to zero across partners.
>
> **What changed, mapped to the original findings:**
> 1. ✅ Bank-balance race → overdraft: entry-create is now wrapped in `withTxn`,
>    with a per-account `txnSeq` guard bump that forces concurrent debits on the
>    same account to serialize (the loser retries against the committed balance).
> 2. ✅ Float money math: `getBankAccountBalance` and `computeVentureSummary` now
>    sum on Decimal128 inside MongoDB aggregations (also removes the N+1
>    `Partner.findById` that ran inside the old JS loop).
> 3. ✅ `markInvoicePaid` non-atomic: earning insert + attachment link + invoice
>    flip now run in one transaction; voiding an earning linked to a **paid**
>    invoice is blocked.
> 4. ✅ EMI board: months-due now capped by `tenureMonths` (finished loans stop
>    accruing "overdue"). *(Partial payments within a month remain legitimately
>    additive — no false "double count" — so no unique constraint was forced.)*
> 5. ✅ Settlement: converted to aggregation; equal-split and former-partner
>    handling preserved. *(Per-partner `sharePct` for unequal ventures still
>    deferred — noted below.)*
> 6. ✅ Cascade integrity: deleting a venture now also removes its invoices;
>    deleting a partner clears dangling `beneficiaryPartnerId` refs.
> 7. ✅ Arbitrary `partnerId` on entry create: validated + assignment-checked
>    (done in Phase 1).
> 8. ✅ Invoice numbering racy/gapped: single company profile enforced via unique
>    `singletonKey`; number allocated **inside** the issue transaction with a
>    per-FY counter, so an aborted issue rolls the number back.
> 9. ✅ Two sources of truth for bank balance: both the summary and the guard now
>    use the same Decimal128 aggregation.
>
> **Still open (deferred):** per-partner ownership `sharePct`; monthly
> reconciliation (§5); opening balances (§5); bank-to-bank transfer type (§5).

### Original findings (for reference)

1. **Bank balance race → overdrafts.** Check-then-write with no atomicity:
   `assertSufficientBankBalance` (`utils/bankBalance.ts:43-60`) then
   `Transaction.create` (`transactions.routes.ts:159-168, 198`). Two concurrent
   outflows both pass. **Fix:** Mongo session/transaction around check+insert, or a
   maintained per-account balance updated via conditional atomic op.

2. **All money math is JS floats.** Amounts are stored as Decimal128 but every
   computation converts to float and loops: settlement (`settlement.service.ts:100-144`),
   EMI (`emi.service.ts:76-142`), GST (`invoice.service.ts:322-352`), bank balance
   (`bankBalance.ts:26-33`). Float accumulation over a growing ledger drifts.
   **Fix:** sum in MongoDB aggregations on Decimal128 (this also fixes the
   performance problems in §9), round only at the display edge.

3. **`markInvoicePaid` is non-atomic and irreversible**
   (`invoice.service.ts:231-255`): three separate writes (txn → attachments →
   invoice); a crash desyncs cashbook and GST. And if the linked EARNING_IN is later
   voided, the invoice stays `paid`. **Fix:** wrap in `withTransaction()`; block
   voiding a transaction linked to a paid invoice (force un-mark-paid first).

4. **EMI board bugs:**
   - `tenureMonths` is never used — months-due accrues forever, fully-paid loans show
     overdue indefinitely (`emi.service.ts:46-55, 112-118`).
   - Duplicate payments for the same period double-count `paidAmount`
     (`emi.service.ts:84-87`); no uniqueness on
     `(ventureId, beneficiaryPartnerId, emiPeriod)`.

5. **Settlement flaws:**
   - Equal split is hardcoded (`settlement.service.ts:189`) — no per-partner
     ownership % field. Fine if every venture is truly equal-share; add a
     `sharePct` on the assignment now (default equal) so unequal ventures don't force
     a schema migration later.
   - Former partners' contributions count in totals but are excluded from the
     settlement denominator (`:152, 173 vs :187-189`) — that money silently vanishes
     from fair-share math. Decide the rule (freeze their row) and implement it
     explicitly.

6. **Cascade delete integrity:** deleting a venture hard-deletes transactions and
   assignments but **leaves invoices orphaned** (`cascade.service.ts:25-31`);
   deleting a partner leaves dangling `beneficiaryPartnerId` and invoice
   `createdById` refs (`:37-45`). Also inconsistent with the soft-delete used
   elsewhere. **Fix:** soft-close ventures instead of deleting once they have
   transactions; cascade must cover every referencing collection and be audited.

7. **Admin can create a transaction with an arbitrary, unvalidated `partnerId`**
   (`transactions.routes.ts:141-142`) — not in the zod schema, not checked as
   assigned to the venture. Validate ObjectId + assignment.

8. **Invoice number allocation is racy and burns numbers.**
   `getOrCreateCompanyProfile` findOne→create with no unique index → duplicate
   singletons under concurrency (`invoice.service.ts:44-52`); the counter `$inc`s
   before issue succeeds → gaps. GST expects a consecutive series per financial year.
   **Fix:** unique index on the profile; allocate the number inside the issue
   transaction; format `PREFIX/FY/SEQ` (e.g. `AL/2025-26/0042`) with FY (Apr–Mar)
   reset; cancelled invoices stay in the series, never deleted.

9. **Two sources of truth for bank balance** — summary's `byBankAccount`
   (`settlement.service.ts:176-184`) computes it one way, `getBankAccountBalance`
   another. One function/aggregation, used everywhere.

---

## 4. Invoice format & PRINT — not usable for a real Indian business yet

What exists: styled on-screen card + `window.print()`
(`ProjectInvoiceDetailPage.tsx:114, 163-246`).

| # | Problem | Fix |
|---|---------|-----|
| 1 | **Dark theme prints as-is** — dark card, light text | `@media print` stylesheet forcing white/black clean A4 layout, or a dedicated light-only print route |
| 2 | **Not a legal GST tax invoice** — missing "TAX INVOICE" title, HSN/SAC per line, place of supply + state code, per-line GST rate, reverse-charge declaration, authorised signatory block | Extend model: `hsnSac` + `gstRate` per **line item**, `placeOfSupply`, `stateCode`; render all CGST Rule 46 mandatory fields |
| 3 | **One GST rate per invoice** (`computeInvoiceMoney`, `invoice.service.ts:116-140`) — can't mix 5% + 18% items | GST rate & HSN move to line items; compute per line, sum |
| 4 | **Inter-state is a manual checkbox** | Derive from company vs customer GSTIN state codes (first 2 digits); manual override only |
| 5 | **No "Amount in words"** | Rupees-in-words helper (lakh/crore) |
| 6 | **No PDF** — print-only, nothing to WhatsApp/email a customer | Server-side PDF (`puppeteer`/`pdfkit`) → `GET /api/invoices/:id/pdf`; doubles as the email attachment (§6) |
| 7 | **No partial payment / TDS** — full total booked as one earning | Amount-received + TDS fields; earning at actual received; balance-due tracked |
| 8 | **GST months bucketed in UTC** (`invoice.service.ts:310`) — 1 Apr 00:30 IST invoice lands in March | Bucket GST periods in `Asia/Kolkata` (GSTR filings are IST months) |
| 9 | **`PATCH /invoices/:id` multiplexes edit/issue/cancel via `body.action`** (`invoices.routes.ts:159-229`) | Separate endpoints: `POST /:id/issue`, `POST /:id/cancel`; PATCH edits drafts only |
| 10 | **GST CSV export built client-side with no comma/quote escaping** (`ProjectGstPage.tsx:39-48`) | Server-generated export like the partner CSV — becomes the GSTR-1-shaped export in §7 |

---

## 5. Bank management flow — missing pieces

1. **No bank-to-bank transfer type.** HDFC → SBI today needs a fake outflow + fake
   investment, corrupting pool totals and partner contributions. Add `TRANSFER`
   (one txn, `fromAccountId`/`toAccountId`, affects both cashbooks, affects **no**
   partner/settlement math).
2. **No opening balance.** Add `openingBalance` + `openingDate` per account.
3. **No reconciliation.** Monthly reconcile flow: enter the statement closing
   balance, show the difference vs computed, flag unmatched entries. This is what
   makes partners trust the numbers.
4. **Passbook-style running balance per row** in the cashbook, computed server-side
   in the same aggregation.
5. **Account deletion guard:** bank accounts are replaced wholesale from the client
   payload (`utils/bankAccounts.ts:18-37`) — removing one orphans its transactions.
   Server must refuse to remove an account with history; deactivate only.

---

## 6. Email flow — completely missing

No mail library exists anywhere. Minimum viable email layer:

| Email | Trigger |
|-------|---------|
| **Account invite** with set-password link | Admin creates user (kills the plaintext-password banner, §2.6) |
| **Password reset** | "Forgot password" on login (doesn't exist — a locked-out partner needs the admin + DB today) |
| **Invoice PDF to customer** | "Send invoice" button (uses §4.6 PDF) |
| **Large-entry alert** (optional) | Entry above configurable amount → other partners |
| **Monthly summary** (optional) | 1st of month: pool balance, contributed, net settlement position |

Implementation: `nodemailer` + your SMTP (Zoho/Google Workspace/SES). One
`email.service.ts` with typed templates; fire-and-forget with retry — a failed email
must never fail the API request. `SMTP_*` in `.env.example` + env validation.

---

## 7. Excel flow — missing (planned in PROJECT-PLAN §9, never built)

The product exists to replace an Excel tracker, so both directions matter:

**Import (one-time migration + bulk add):** admin uploads `.xlsx` → server parses
(`exceljs`) → column mapping (Date/Type/Partner/Amount/Bank/Category/Remark) →
**row-level validation preview** (unknown partner, bad date, negative amount, unknown
bank) → confirm → insert in one DB transaction tagged with `importBatchId` so a bad
import rolls back as a unit.

**Export (CA/accountant handoff — asked for at tax time):** per project, date-range
filtered `.xlsx`: full ledger, bank cashbook, **GST register in GSTR-1 shape**
(invoice-wise), settlement statement. The existing CSV
(`partner-analytics.service.ts`) covers only one partner's view.

---

## 8. Flow & starting dashboard — the app has NO dashboard today

Audit-confirmed reality of the current flow:

- `/app` is just a **paginated project-card grid** with zero aggregate numbers
  (`HomePage.tsx:100-129`); the sidebar even uses a dashboard icon for it
  (`sidebarNav.ts:29`).
- Opening a project **lands on the Add-Entry form** (`App.tsx:33` redirects to
  `entries`, whose default sub-tab is `'add'` — `ProjectEntriesPage.tsx:15`). The
  actual overview (Analysis) is **last** in the sidebar (`sidebarNav.ts:55`).
- **There are no charts anywhere.** `recharts` is installed (`package.json:16`) but
  never imported — "Analysis" is number tiles and tables only.
- KPI tiles are duplicated with drifting names: header shows
  Contributed/Pool/Earnings/Bank on every sub-page (`ProjectLayout.tsx:119-133`)
  while Analysis re-renders overlapping tiles with different labels
  (`ProjectAnalysisTab.tsx:25-72`).
- `PartnerAnalyticsPage` renders inside the project chrome → double headers + 9 KPI
  cards + full entry log = wall of data.
- Sub-navigation is done three different ways (sidebar NavLinks, tab buttons, local
  `mode` state not in the URL) — "create invoice"/"add earning" aren't linkable and
  reset on refresh.
- `ProjectComingSoonPage.tsx` is dead code (not routed).

### Target flow (straightforward: summary first, detail on demand)

**A. Home dashboard at `/app`** (new — this is the starting screen):
- Row 1 — 4 KPI cards across all my projects: total bank cash · my total contributed
  · my net settlement position (owed/owes, coloured **with a text label**, not colour
  alone) · this month in vs out.
- Row 2 — projects table: name/type · pool balance · my contributed · my net ·
  last activity → click straight into the project. (Card grid demoted or removed.)
- Row 3 — recent activity: last 8–10 entries across projects (who/what/amount) —
  doubles as passive review of what other partners logged.
- Powered by ONE endpoint `GET /api/dashboard/summary` (server aggregations).

**B. Project index lands on Analysis (overview), not the add form.** Sidebar order:
Overview → Entries → Bank → Earnings → EMI → Invoices → GST → Documents. Keep a
prominent "+ Add Entry" button in the project header from anywhere.

**C. Real charts on Analysis** (finally use recharts, lazy-loaded):
- Partner contribution share — donut
- Monthly money in vs out — grouped bars (time series)
- Category spend — horizontal bars, top 8 + "Other"
Max 2 charts visible per screen; drop any chart that restates a table.

**D. De-duplicate KPIs:** the header band shows exactly 4 numbers with ONE canonical
name each (Contributed · Pool balance · Bank cash · Earnings), only on pages where
they're relevant; Analysis owns the detailed tiles. Pick one term per concept and use
it everywhere (glossary: Contributed = investments + direct expenses).

**E. Ledger readability:** entry lists become scannable table rows (date · type badge
· partner · amount · bank · proof icon), not big cards with `text-2xl` amounts and
inline thumbnails (`ProjectTransactionsTab.tsx:239, 273-275`). Amount short-format
above 1 lakh (₹2.8L) in tiles; full value in tables/tooltips.

**F. Every list/tab state goes in the URL** (sub-tab, filters, page) so refresh and
share-links work.

---

## 9. Loading & performance optimization

### Backend
1. **Kill the load-everything-into-JS pattern.** Confirmed hotspots that must become
   MongoDB aggregations: `computeVentureSummary` loads the full transaction history
   (`settlement.service.ts:54`), with `Partner.findById` **inside the loop** — N+1
   (`:104`); bank balance (`bankBalance.ts:15-33`) runs on every outflow; GST summary
   loads all invoices (`invoice.service.ts:305`); EMI does N+1 partner lookups
   (`emi.service.ts:147`).
2. **Admin dashboard is O(ventures × transactions)** — loops every venture calling
   the full summary (`admin.routes.ts:40-53`). One aggregation across ventures.
3. **Indexes to match queries:** `Transaction {ventureId, date}`,
   `{ventureId, bankAccountId, isDeleted}`, `{ventureId, type}`; `Invoice
   {ventureId, status, issueDate}`; verify with `.explain()`.
4. **Admin assignments list loads the whole collection then paginates in JS**
   (`adminAssignments.routes.ts:76-95`) — paginate in the query.
5. **`getDownloadUrl` stats the disk per attachment per row** on every list
   (`r2.service.ts:139-147`) — resolve lazily or batch.
6. **Unhandled async route errors:** many `async` handlers have no try/catch and
   Express 4 won't forward rejections (`ventures.routes.ts:21-162`,
   `admin.routes.ts:40,59,201`, `files.routes.ts:146-222`, more) — requests hang.
   Add `express-async-errors` or a `wrapAsync` helper on every route.

### Frontend
7. **Adopt TanStack Query.** Everything is raw `fetch` in `useEffect` — no cache, no
   dedup, refetch-all on every navigation, manual `refreshKey` threading. This one
   change also fixes:
   - the **double initial fetch** (`ProjectTransactionsTab.tsx:81-83`,
     `ProjectDocumentsTab.tsx:22-24`),
   - the **race condition** in `usePaginatedList` (no AbortController — last
     *arriving* response wins, `usePaginatedList.ts:45-66`),
   - stale-after-mutation (targeted invalidation instead of refresh keys),
   - the invoice list not resetting to page 1 after create
     (`ProjectInvoicesPage.tsx:82`).
8. **One request per page.** `AddEntryForm` fires 4 requests on mount including the
   full venture summary just for account balances (`AddEntryForm.tsx:121-135`) —
   pass layout data via outlet context / query cache.
9. **Code-split routes.** Single 385 KB bundle, zero `React.lazy`. Lazy-load admin,
   invoice detail, and Analysis (charts) at minimum.
10. **Skeleton loaders** for KPI cards and tables (currently bare "Loading..." text
    everywhere) + visible error-with-retry states; stop silently swallowing errors
    (`.catch(() => setTypes([]))` — `HomePage.tsx:31`; `AdminPage.loadOptions` has
    no catch at all, `AdminPage.tsx:46-59`).
11. **401 handling:** `window.location.assign('/login')` from inside the fetch util
    (`api.ts:17-23`) hard-reloads and loses state — route through the auth context.
12. **Documents grid needs thumbnails**, not full-size receipt photos.

---

## 10. Production readiness checklist (beyond flows)

- [ ] Mongo **replica set** so `withTransaction()` works (one flag on Atlas); wrap
      all multi-write flows (§3).
- [ ] **Timezone policy:** store UTC, display + bucket all reports (GST, EMI months,
      monthly charts) in IST — EMI/GST currently bucket in UTC
      (`emi.service.ts:35-38`, `invoice.service.ts:310`).
- [ ] **Toast/notification system** + accessible modal primitive (focus trap,
      Escape-to-close, scroll lock — none of the dialogs have these,
      `ConfirmDialog.tsx:28-103`).
- [ ] **Audit log every mutation** — today only transaction voids record who/when;
      invoices, bank accounts, assignments, user changes have no trail.
- [ ] **Soft-delete only** for anything with money history (cascade paths currently
      hard-delete, §3.6).
- [ ] **Structured logging** (pino) + request logging; central error handler (§2.7);
      uptime monitor on a **real** health check that pings Mongo (currently static
      `{status:'ok'}`, `app.ts:28-30`).
- [ ] **Graceful shutdown** (SIGTERM drain — none today, `index.ts:8-19`).
- [ ] **Env validation hard-fails in production** on default/placeholder secrets or
      localhost DB (currently defaults slip through, `env.ts:10-11`).
- [ ] **Seed guard:** refuse `npm run seed` when `NODE_ENV=production` (it wipes
      collections).
- [ ] **Backups:** nightly Mongo dump + R2 versioning; test one restore before
      go-live.
- [ ] **Consistent API envelope** (`{data}` / `{error: {message, fields}}` — zod
      errors currently return only the first issue) and `/api/v1` prefix.
- [ ] **Remove dead weight:** unused `recharts` (until §8C uses it), unrouted
      `ProjectComingSoonPage`, unused `VITE_APP_NAME`; add the missing
      `favicon.svg`.
- [ ] Remove the hardcoded `@apexledger.local` email domain in admin user creation
      (`AdminPage.tsx:151,171`) — real partner emails needed for §6.
- [ ] HTTPS, helmet, CORS locked to the real domain.
- [ ] Basic test coverage on the money math (settlement, bank balance, GST split,
      EMI) — these are the functions that must never silently break.

---

## 11. Suggested order of work

| Phase | Content | Why |
|-------|---------|-----|
| **1. Security** | §2: path traversal, files/confirm, helmet, JWT, admin guards | Exploitable today by any logged-in user |
| **2. Money correctness** | §3 + Mongo transactions + aggregations + indexes | Wrong balances poison everything downstream |
| **3. Invoice/GST compliance** | §4: print template, FY numbering, per-line HSN/GST, PDF | Legal requirement the moment a real invoice goes out |
| **4. Bank flow completion** | §5: transfers, opening balance, running balance, reconcile | Makes the cashbook trustworthy day-to-day |
| **5. Dashboard + flow + loading** | §8 + §9: home dashboard, land-on-overview, charts, react-query, code-split | The daily-use experience |
| **6. Email + Excel** | §6 + §7 | Onboarding, customer invoices, CA handoff |
| **7. Hardening** | §10 checklist | Before real users/data |

---

*Full-code audit, 22 Jul 2026. Every numbered finding carries the file:line to change.*
