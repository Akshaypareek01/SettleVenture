# ApexLedger — Partner Investment & Expense Tracker
## Project Plan, Architecture & Phase Tasks

> **Status:** Planning only — no code scaffold yet.  
> **Brand:** **ApexLedger** — enterprise-grade partner finance intelligence.  
> **Stack:** Node.js · Express · TypeScript · MongoDB (local) · Cloudflare R2 · React · Vite · Tailwind  
> **UI:** Dark fintech dashboard (card-based KPIs, sidebar nav, kanban-ready venture boards)

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
2. [Tech Stack Decisions](#2-tech-stack-decisions)
3. [Repository & Folder Structure](#3-repository--folder-structure)
4. [Page Structure & Routes](#4-page-structure--routes)
5. [UI / Design System (Dark Theme)](#5-ui--design-system-dark-theme)
6. [MongoDB Data Model](#6-mongodb-data-model)
7. [API Surface](#7-api-surface)
8. [R2 Storage Strategy](#8-r2-storage-strategy)
9. [Excel Import + Proof Upload Flow](#9-excel-import--proof-upload-flow)
10. [KPIs & Analytics (Spend by User)](#10-kpis--analytics-spend-by-user)
11. [Auth & Roles](#11-auth--roles)
12. [Edge Cases & Guardrails](#12-edge-cases--guardrails)
13. [Future Extensibility](#13-future-extensibility)
14. [Environment Variables](#14-environment-variables)
15. [Build Phases & Tasks](#15-build-phases--tasks)
16. [Definition of Done (v1)](#16-definition-of-done-v1)

---

## 1. Vision & Scope

### What ApexLedger replaces
The existing Excel workflow:
```
Contributions IN → Pool Account → Vendor Payments OUT
+ Direct Expenses
+ Settlement (fair-share math)
```

### What we are building
A **venture-agnostic** partner finance platform where:
- Any venture type (Truck, Car, Plot, Jamin, Company setup, etc.) is **data**, not code
- Partners log in, view KPIs, add transactions, upload proof (screenshots, receipts, Excel)
- Admin manages ventures, categories, users, and bulk Excel imports
- Analytics show **spend by user**, category breakdown, pool balance, settlement status
- All mutations are **audit-logged** with before/after snapshots

### Out of scope for v1
- Open public signup (invite/admin-created accounts only)
- Multi-org SaaS tenancy
- Email notifications / webhooks
- Mobile native apps (API designed to support later)
- Payment gateway integration

---

## 2. Tech Stack Decisions

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20 LTS | User requirement; stable LTS |
| API | Express + TypeScript | Simple, familiar, easy to extend |
| DB | **MongoDB** (local) + Mongoose | User requirement; flexible schema for venture types |
| Auth | JWT (httpOnly cookie) + bcrypt | 3–5 users; no over-engineering |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` | Presigned direct upload; no server proxy |
| Frontend | React 18 + Vite + React Router | Fast dev, SPA for dashboard |
| Styling | Tailwind CSS + shadcn/ui (dark) | Card-based dark UI like reference |
| Charts | Recharts | KPI pies, bar charts, sparklines |
| Excel | `xlsx` (SheetJS) server-side parse | Bulk import with validation report |
| Validation | Zod | Shared request schemas |
| Dev DB | MongoDB Community @ `mongodb://localhost:27017/apexledger` | Local per user request |

> **Note:** Original spec used PostgreSQL + Prisma. This plan uses **MongoDB + Mongoose** per your direction. Settlement math and venture generalization logic remain identical.

---

## 3. Repository & Folder Structure

Monorepo layout — one repo, clear separation:

```
apexledger/
├── README.md
├── PROJECT-PLAN.md                 ← this file
├── .env.example
├── .gitignore
├── package.json                    ← npm workspaces root
│
├── apps/
│   ├── api/                        ← Express backend
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── config/
│   │   │   │   ├── env.ts
│   │   │   │   ├── db.ts
│   │   │   │   └── r2.ts
│   │   │   ├── models/             ← Mongoose schemas
│   │   │   │   ├── Partner.model.ts
│   │   │   │   ├── Venture.model.ts
│   │   │   │   ├── VentureType.model.ts
│   │   │   │   ├── Category.model.ts
│   │   │   │   ├── Transaction.model.ts
│   │   │   │   ├── Attachment.model.ts
│   │   │   │   ├── AuditLog.model.ts
│   │   │   │   ├── ExcelImport.model.ts
│   │   │   │   └── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── ventures.routes.ts
│   │   │   │   ├── categories.routes.ts
│   │   │   │   ├── transactions.routes.ts
│   │   │   │   ├── files.routes.ts
│   │   │   │   ├── summary.routes.ts
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── imports.routes.ts
│   │   │   │   ├── audit.routes.ts
│   │   │   │   └── admin.routes.ts
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── settlement.service.ts
│   │   │   │   ├── analytics.service.ts
│   │   │   │   ├── r2.service.ts
│   │   │   │   ├── excel-import.service.ts
│   │   │   │   └── audit.service.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── admin.middleware.ts
│   │   │   │   ├── validate.middleware.ts
│   │   │   │   └── error.middleware.ts
│   │   │   ├── utils/
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── pagination.ts
│   │   │   │   └── decimal.ts
│   │   │   └── seed/
│   │   │       └── seed.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                        ← React frontend
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── routes/
│       │   │   ├── index.tsx           ← route definitions
│       │   │   ├── PublicRoutes.tsx
│       │   │   └── ProtectedRoutes.tsx
│       │   ├── pages/
│       │   │   ├── landing/
│       │   │   │   ├── LandingPage.tsx
│       │   │   │   ├── sections/
│       │   │   │   │   ├── Hero.tsx
│       │   │   │   │   ├── Features.tsx
│       │   │   │   │   ├── HowItWorks.tsx
│       │   │   │   │   ├── VentureTypes.tsx
│       │   │   │   │   ├── Pricing.tsx
│       │   │   │   │   └── Footer.tsx
│       │   │   │   └── LoginPage.tsx
│       │   │   ├── dashboard/
│       │   │   │   ├── DashboardPage.tsx
│       │   │   │   ├── components/
│       │   │   │   │   ├── KpiCards.tsx
│       │   │   │   │   ├── PartnerSpendChart.tsx
│       │   │   │   │   ├── CategoryBarChart.tsx
│       │   │   │   │   ├── SettlementTable.tsx
│       │   │   │   │   └── RecentActivity.tsx
│       │   │   │   └── AnalyticsPage.tsx
│       │   │   ├── ventures/
│       │   │   │   ├── VentureListPage.tsx
│       │   │   │   ├── VentureDetailPage.tsx
│       │   │   │   └── VentureBoardPage.tsx    ← kanban-style (future)
│       │   │   ├── transactions/
│       │   │   │   ├── TransactionsPage.tsx
│       │   │   │   └── TransactionFormModal.tsx
│       │   │   ├── files/
│       │   │   │   └── FileManagerPage.tsx
│       │   │   ├── admin/
│       │   │   │   ├── AdminLayout.tsx
│       │   │   │   ├── AdminDashboard.tsx
│       │   │   │   ├── PartnersPage.tsx
│       │   │   │   ├── VentureTypesPage.tsx
│       │   │   │   ├── ExcelImportPage.tsx
│       │   │   │   └── AuditLogPage.tsx
│       │   │   └── settings/
│       │   │       └── SettingsPage.tsx
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── TopNav.tsx
│       │   │   │   ├── VentureSwitcher.tsx
│       │   │   │   └── Breadcrumbs.tsx
│       │   │   ├── ui/                 ← shadcn primitives
│       │   │   ├── charts/
│       │   │   ├── forms/
│       │   │   └── files/
│       │   │       ├── FileDropzone.tsx
│       │   │       └── AttachmentPreview.tsx
│       │   ├── hooks/
│       │   │   ├── useAuth.ts
│       │   │   ├── useVenture.ts
│       │   │   └── usePresignedUpload.ts
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   └── format.ts
│       │   ├── contexts/
│       │   │   ├── AuthContext.tsx
│       │   │   └── VentureContext.tsx
│       │   └── styles/
│       │       └── globals.css
│       └── package.json
│
└── packages/
    └── shared/                     ← shared types + Zod schemas
        ├── src/
        │   ├── types/
        │   ├── schemas/
        │   └── constants/
        └── package.json
```

**File size rule:** No source file > 500 lines. Split pages into `sections/` and `components/` subfolders as shown.

---

## 4. Page Structure & Routes

### Public (unauthenticated)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | AAA marketing site — hero, features, CTA to login |
| `/login` | LoginPage | Email + password; redirect to dashboard |
| `/about` | AboutPage (optional v1.1) | Company story |

### Partner Portal (authenticated — all partners)

| Route | Page | Purpose |
|-------|------|---------|
| `/app` | → redirect `/app/dashboard` | Entry |
| `/app/dashboard` | DashboardPage | KPI cards, charts, settlement snapshot |
| `/app/analytics` | AnalyticsPage | Spend by user, date range filters, export |
| `/app/ventures` | VentureListPage | All ventures grouped by type |
| `/app/ventures/:id` | VentureDetailPage | Single venture overview + quick actions |
| `/app/ventures/:id/transactions` | TransactionsPage | Filterable table + add/edit modal |
| `/app/ventures/:id/files` | FileManagerPage | Attachment grid, preview, download |
| `/app/activity` | ActivityLogPage | Audit feed (read-only for partners) |
| `/app/settings` | SettingsPage | Profile, password change |

### Admin Section (authenticated — admin role only)

| Route | Page | Purpose |
|-------|------|---------|
| `/app/admin` | AdminDashboard | System-wide KPIs across all ventures |
| `/app/admin/partners` | PartnersPage | CRUD partners, invite, deactivate |
| `/app/admin/venture-types` | VentureTypesPage | Manage Car, Truck, Plot, Jamin, Company, custom |
| `/app/admin/ventures` | AdminVenturesPage | Create/close ventures, assign categories |
| `/app/admin/import` | ExcelImportPage | Upload Excel + proof screenshots, review & commit |
| `/app/admin/audit` | AuditLogPage | Full audit trail with filters |

### Navigation Sidebar (partner portal)

```
┌─────────────────────────┐
│  ◆ ApexLedger           │
│  [Venture Switcher ▼]   │
├─────────────────────────┤
│  🏠 Overview            │  → /app/dashboard
│  📊 Analytics           │  → /app/analytics
│  📁 Ventures            │  → /app/ventures
│  💳 Transactions        │  → /app/ventures/:id/transactions
│  📎 Files               │  → /app/ventures/:id/files
│  📋 Activity            │  → /app/activity
├─────────────────────────┤
│  ⚙️  Settings           │
│  🛡️  Admin  (admin only)│
└─────────────────────────┘
```

### Top Nav Tabs (within venture context — like reference dashboard)

```
[ Overview ] [ Transactions ] [ Analytics ] [ Files ] [ Activity ]
```

Active tab = filled dark pill; inactive = ghost/outline.

---

## 5. UI / Design System (Dark Theme)

Inspired by reference: fintech card dashboard + kanban color pills.

### Color Tokens

```css
/* apps/web/src/styles/tokens.css (conceptual) */
--bg-base:        #0a0a0f;      /* page background */
--bg-surface:     #12121a;      /* card background */
--bg-elevated:    #1a1a24;      /* hover / modal */
--border:         #2a2a3a;
--text-primary:   #f4f4f5;
--text-muted:     #71717a;
--accent-green:   #22c55e;      /* positive trends, CTAs */
--accent-green-dim: #166534;
--accent-purple:  #a78bfa;      /* in-progress / conversation */
--accent-red:     #f87171;      /* negative / closed lost */
--accent-orange:  #fb923c;      /* warning tags */
--accent-blue:    #60a5fa;      /* info links */
```

### Component Patterns

| Component | Style |
|-----------|-------|
| KPI Card | `--bg-surface`, rounded-2xl, subtle border, large bold number, green sparkline bottom |
| Chart Card | Full-width bar chart; highlighted bar with floating tooltip + green % pill |
| List Card | Icon circle + label + amount + red/green trend arrow |
| Sidebar | Slim icon rail OR expanded; active item = green left border + glow |
| Pills / Tags | Rounded-full; venture-type colors from DB `colorHex` field |
| Kanban Column | Pill header with count badge; cards with name, amount, date, assignee, tags |
| Buttons | Primary = green fill; Secondary = outline on dark surface |
| Inputs | Dark bg, light border on focus green |

### Typography
- Font: **Inter** or **Geist Sans**
- KPI numbers: `text-4xl font-bold tracking-tight`
- Labels: `text-sm text-muted uppercase tracking-wide`

### Accessibility
- All icon buttons: `aria-label`
- Chart data: accessible table fallback
- Focus rings: green outline
- Min contrast ratio 4.5:1 on text

---

## 6. MongoDB Data Model

### VentureType (future-proof registry)

```typescript
{
  _id: ObjectId,
  slug: "truck" | "car" | "plot" | "jamin" | "company" | string,  // unique
  label: "Truck",
  icon: "truck",           // lucide icon name
  colorHex: "#22c55e",
  isActive: true,
  sortOrder: 1,
  createdAt, updatedAt
}
```

### Partner

```typescript
{
  _id: ObjectId,
  name: string,
  email: string,           // unique index
  passwordHash: string,
  role: "partner" | "admin",
  isActive: true,
  avatarUrl?: string,
  createdAt, updatedAt
}
```

### Venture

```typescript
{
  _id: ObjectId,
  name: "Truck 1",
  ventureTypeId: ObjectId,  // ref VentureType
  description?: string,
  status: "active" | "closed",
  metadata: {               // flexible per venture type
    registrationNo?: string,
    location?: string,
    // car: { plateNumber }, plot: { surveyNo }, etc.
  },
  createdAt, updatedAt
}
```

### Category

```typescript
{
  _id: ObjectId,
  ventureId?: ObjectId,     // null = global category
  name: "Fuel",
  type: "CONTRIBUTION_IN" | "VENDOR_PAYMENT_OUT" | "EXPENSE",
  isActive: true
}
```

### Transaction

```typescript
{
  _id: ObjectId,
  ventureId: ObjectId,
  type: "CONTRIBUTION_IN" | "VENDOR_PAYMENT_OUT" | "EXPENSE",
  partnerId: ObjectId,
  amount: Decimal128,       // never float
  date: Date,
  paidFrom?: string,
  paidTo?: string,
  categoryId?: ObjectId,
  remark?: string,
  createdById: ObjectId,
  isDeleted: false,           // soft delete
  deletedAt?: Date,
  deletedById?: ObjectId,
  createdAt, updatedAt
}
```

### Attachment

```typescript
{
  _id: ObjectId,
  ventureId: ObjectId,
  transactionId?: ObjectId,  // optional for import-level proofs
  excelImportId?: ObjectId,
  r2Key: string,
  fileName: string,
  fileType: string,
  fileSizeBytes: number,
  uploadedById: ObjectId,
  uploadedAt: Date
}
```

### ExcelImport

```typescript
{
  _id: ObjectId,
  ventureId: ObjectId,
  uploadedById: ObjectId,
  fileName: string,
  r2Key: string,
  status: "pending" | "validated" | "committed" | "failed",
  rowCount: number,
  successCount: number,
  errorCount: number,
  errors: [{ row: number, field: string, message: string }],
  committedAt?: Date,
  createdAt
}
```

### AuditLog

```typescript
{
  _id: ObjectId,
  partnerId: ObjectId,
  action: "created" | "updated" | "deleted" | "imported" | "uploaded",
  entityType: string,
  entityId: ObjectId,
  ventureId?: ObjectId,
  before?: object,
  after?: object,
  ipAddress?: string,
  timestamp: Date
}
```

### Indexes (critical)

```
Partner:     { email: 1 } unique
Venture:     { ventureTypeId: 1, status: 1 }
Transaction: { ventureId: 1, date: -1 }, { ventureId: 1, partnerId: 1 }, { isDeleted: 1 }
Attachment:  { ventureId: 1 }, { transactionId: 1 }
AuditLog:    { ventureId: 1, timestamp: -1 }, { entityType: 1, entityId: 1 }
```

---

## 7. API Surface

Base URL: `http://localhost:4000/api`

### Auth
```
POST   /auth/login
POST   /auth/logout
GET    /auth/me
PATCH  /auth/password
POST   /auth/register          (admin only)
```

### Ventures & Types
```
GET    /venture-types
POST   /venture-types          (admin)
PATCH  /venture-types/:id      (admin)

GET    /ventures
POST   /ventures               (admin)
GET    /ventures/:id
PATCH  /ventures/:id
```

### Categories
```
GET    /ventures/:id/categories
POST   /ventures/:id/categories
PATCH  /categories/:id
DELETE /categories/:id         (soft — isActive=false)
```

### Transactions
```
GET    /ventures/:id/transactions?type&partnerId&categoryId&from&to&page&limit
POST   /ventures/:id/transactions
GET    /transactions/:id
PATCH  /transactions/:id
DELETE /transactions/:id       (soft delete)
```

### Summary & Analytics
```
GET    /ventures/:id/summary
GET    /ventures/:id/analytics/spend-by-partner?from&to
GET    /ventures/:id/analytics/spend-by-category?from&to
GET    /admin/analytics/overview          (admin — all ventures)
```

### Files (R2)
```
POST   /files/presign          → { uploadUrl, r2Key, expiresIn }
POST   /files/confirm          → creates Attachment row
GET    /files/:id/download     → presigned GET url
DELETE /files/:id
GET    /ventures/:id/files
```

### Excel Import (admin)
```
POST   /imports/presign          → Excel file to R2
POST   /imports/:id/validate     → parse + return preview/errors
POST   /imports/:id/commit       → bulk insert transactions
GET    /imports?ventureId=
GET    /imports/:id
```

### Audit
```
GET    /audit-logs?ventureId&entityType&entityId&partnerId&from&to
```

### Admin
```
GET    /admin/partners
POST   /admin/partners
PATCH  /admin/partners/:id
GET    /admin/dashboard
```

---

## 8. R2 Storage Strategy

### Bucket layout
```
apexledger/
├── ventures/{ventureId}/transactions/{transactionId}/{uuid}-{filename}
├── ventures/{ventureId}/imports/{importId}/{uuid}-{filename}
└── ventures/{ventureId}/proofs/{uuid}-{filename}
```

### Upload flow (never proxy through API)
1. Client → `POST /files/presign` with `{ ventureId, transactionId?, fileName, fileType, fileSize }`
2. API validates auth + size limits (max 10MB images, 25MB Excel) → returns presigned PUT URL
3. Client uploads **directly to R2**
4. Client → `POST /files/confirm` with `{ r2Key, ... }` → API writes Attachment + AuditLog
5. On failure at step 3: no DB row; optional cron to clean orphan R2 keys (v1.1)

### Delete flow
1. API deletes R2 object + Attachment row in sequence
2. AuditLog entry with `before` snapshot
3. If R2 delete fails → mark attachment `pendingDelete`, retry job (v1.1)

### Allowed MIME types
- Images: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
- Docs: `application/pdf`
- Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `.xls`

---

## 9. Excel Import + Proof Upload Flow

### Admin UI flow (`/app/admin/import`)

```
Step 1: Select Venture + Venture Type
Step 2: Upload Excel (.xlsx) via presigned URL
Step 3: Upload proof screenshots (optional, multiple) — bank stmts, WhatsApp, receipts
Step 4: Click "Validate" → server parses, shows preview table + error rows
Step 5: Review errors inline (fix Excel or skip bad rows)
Step 6: "Commit Import" → bulk insert transactions + link proofs
Step 7: Success summary + link to venture dashboard
```

### Expected Excel columns (configurable mapping in v1.1)

| Column | Required | Maps to |
|--------|----------|---------|
| Date | Yes | `transaction.date` |
| Type | Yes | CONTRIBUTION_IN / VENDOR_PAYMENT_OUT / EXPENSE |
| Partner | Yes | resolve by name or email |
| Amount | Yes | `transaction.amount` |
| Category | No | resolve or create |
| Paid From | No | `paidFrom` |
| Paid To | No | `paidTo` |
| Remark | No | `remark` |

### Validation rules
- Amount > 0
- Date not in future (> today + 1 day buffer for timezone)
- Partner must exist and be active
- Type must be valid enum
- Duplicate detection: same partner + amount + date + type within venture → warn (not block)

---

## 10. KPIs & Analytics (Spend by User)

### Dashboard KPI Cards (per venture)

| Card | Value | Subtext |
|------|-------|---------|
| Pool Balance | `poolIn - poolOut` | green/red trend vs last period |
| Total Contributed | sum CONTRIBUTION_IN + EXPENSE | all partners |
| Total Spent (Vendor) | sum VENDOR_PAYMENT_OUT | from pool |
| Active Partners | count distinct partnerId | this venture |

### Charts

1. **Partner Contribution Pie** — % of total contributed per partner
2. **Category Spend Bar** — VENDOR_PAYMENT_OUT + EXPENSE by category
3. **Spend by User Over Time** — stacked area or grouped bar by month
4. **Settlement Table** — fair share math (see below)

### Settlement math (core business logic)

```typescript
totalContributed[partner] =
  sum(CONTRIBUTION_IN where partner) + sum(EXPENSE where partner)

fairShare[partner] = totalContributed_all / activePartnerCount

netBalance[partner] = totalContributed[partner] - fairShare[partner]

status:
  netBalance > 0  → "owed_by_group"   (group owes this partner)
  netBalance < 0  → "owes_group"
  netBalance == 0 → "settled"
```

### Analytics page filters
- Date range picker (preset: 7d, 30d, 90d, YTD, custom)
- Partner multi-select
- Transaction type filter
- Export CSV button

---

## 11. Auth & Roles

| Role | Can do |
|------|--------|
| `partner` | View dashboard, CRUD own transactions, upload files, view activity |
| `admin` | Everything + manage partners, ventures, types, Excel import, full audit |

### Session
- JWT in httpOnly cookie (`SameSite=Strict`, `Secure` in prod)
- 7-day expiry; refresh on activity
- Rate limit login: 5 attempts / 15 min per IP

### Seed users (dev)
```
admin@apexledger.local   / Admin123!   (admin)
partner1@apexledger.local / Partner123! (partner)
partner2@apexledger.local / Partner123! (partner)
partner3@apexledger.local / Partner123! (partner)
```

---

## 12. Edge Cases & Guardrails

### Financial
| Edge case | Handling |
|-----------|----------|
| Zero-amount transaction | Reject at validation |
| Negative amount | Reject (use transaction type for direction) |
| Floating point drift | Store as Decimal128; display rounded to 2 decimals |
| Venture closed | Block new transactions; allow read-only + export |
| Partner deactivated | Block login; historical data preserved |
| Delete transaction with attachments | Soft-delete txn; attachments remain viewable unless explicitly deleted |
| Settlement with 1 partner | fairShare = totalContributed (netBalance = 0) |
| Settlement with 0 transactions | All zeros; show empty state |

### Files
| Edge case | Handling |
|-----------|----------|
| Upload succeeds, confirm fails | Orphan R2 key; admin can re-confirm or cleanup job |
| File too large | Reject at presign with clear error |
| Wrong MIME type | Reject at presign |
| Duplicate filename | UUID prefix in r2Key — always unique |
| Download expired presigned URL | Client re-requests download endpoint |

### Excel Import
| Edge case | Handling |
|-----------|----------|
| Partial valid rows | Commit valid only if admin confirms; log skipped rows |
| Unknown partner name in Excel | Error row; suggest fuzzy match in UI |
| Duplicate import | Warn if >80% rows match existing txn fingerprints |
| Excel with multiple sheets | Use first sheet; warn if others exist |
| Empty Excel | Reject with message |

### Auth
| Edge case | Handling |
|-----------|----------|
| Expired JWT | 401 → redirect to login |
| Partner tries admin route | 403 + toast |
| Concurrent edit same transaction | Last write wins + audit both (before on second) |

### UI
| Edge case | Handling |
|-----------|----------|
| No ventures yet | Empty state with "Contact admin" CTA |
| No venture selected | Default to first active venture |
| Long partner names | Truncate with tooltip |
| Mobile viewport | Sidebar collapses to bottom nav (v1.1) |

---

## 13. Future Extensibility

### Adding a new venture type (e.g., "Jamin")
1. Admin → Venture Types → Add `{ slug: "jamin", label: "Jamin", icon, colorHex }`
2. Admin → Create Venture with that type
3. Add categories specific to venture (or use global)
4. **No code deploy required**

### Planned v2 features (design hooks now)
- `Venture.metadata` JSON for type-specific fields
- Kanban board per venture (`VentureBoardPage`) — status columns as data
- Multi-currency support (`currency` field on Venture)
- Recurring transactions template
- PDF export of settlement report
- Webhook on transaction create
- Mobile app consuming same REST API

### Venture type seed (v1)

| slug | label | colorHex |
|------|-------|----------|
| truck | Truck | #22c55e |
| car | Car | #60a5fa |
| plot | Plot | #a78bfa |
| jamin | Jamin | #fb923c |
| company | Company | #f472b6 |

---

## 14. Environment Variables

```bash
# apps/api/.env.example

# Server
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb://localhost:27017/apexledger

# JWT
JWT_SECRET=change-me-in-production-min-32-chars
JWT_EXPIRES_IN=7d

# Cloudflare R2 (user will add credentials)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=apexledger
R2_PUBLIC_URL=                          # optional CDN

# Limits
MAX_FILE_SIZE_MB=10
MAX_EXCEL_SIZE_MB=25

# Seed
SEED_ADMIN_EMAIL=admin@apexledger.local
SEED_ADMIN_PASSWORD=Admin123!
```

```bash
# apps/web/.env.example
VITE_API_URL=http://localhost:4000/api
VITE_APP_NAME=ApexLedger
```

---

## 15. Build Phases & Tasks

### Phase 0 — Project Bootstrap (Day 1)
**Goal:** Runnable monorepo skeleton, local MongoDB connected, dark shell visible.

- [ ] **0.1** Init npm workspaces root + `apps/api` + `apps/web` + `packages/shared`
- [ ] **0.2** Configure TypeScript, ESLint, Prettier across packages
- [ ] **0.3** Express app with health check `GET /api/health`
- [ ] **0.4** Mongoose connect to `mongodb://localhost:27017/apexledger`
- [ ] **0.5** Vite + React + Tailwind + dark theme tokens
- [ ] **0.6** `.env.example` files for api + web
- [ ] **0.7** README with local setup steps (MongoDB install, npm run dev)

**Exit criteria:** `npm run dev` starts API on :4000 and web on :5173; health check passes.

---

### Phase 1 — Data Layer & Seed (Day 2)
**Goal:** All Mongoose models, indexes, seed script.

- [ ] **1.1** Implement all models (Partner, VentureType, Venture, Category, Transaction, Attachment, ExcelImport, AuditLog)
- [ ] **1.2** Create indexes per schema section above
- [ ] **1.3** Seed script: 5 venture types, 1 venture "Truck 1", 3 partners, 10 sample categories, 20 sample transactions
- [ ] **1.4** Shared Zod schemas in `packages/shared`
- [ ] **1.5** Decimal helper utils (no JS float math)

**Exit criteria:** `npm run seed` populates DB; verify in MongoDB Compass.

---

### Phase 2 — Auth (Day 3)
**Goal:** Login/logout, protected routes, admin gate.

- [ ] **2.1** `POST /auth/login` — bcrypt verify, JWT cookie
- [ ] **2.2** `GET /auth/me` — return partner + role
- [ ] **2.3** `POST /auth/logout` — clear cookie
- [ ] **2.4** Auth middleware (requireAuth, requireAdmin)
- [ ] **2.5** `POST /auth/register` (admin creates partner)
- [ ] **2.6** Frontend: AuthContext, LoginPage, ProtectedRoutes
- [ ] **2.7** Rate limiting on login endpoint

**Exit criteria:** Login works; non-auth requests to `/ventures` return 401; admin routes return 403 for partners.

---

### Phase 3 — Ventures, Categories, Transactions CRUD (Days 4–5)
**Goal:** Core API without files — replaces Excel data entry.

- [ ] **3.1** Venture CRUD routes (admin create; all read)
- [ ] **3.2** VentureType CRUD (admin)
- [ ] **3.3** Category CRUD per venture
- [ ] **3.4** Transaction CRUD with filters (type, partner, category, date range, pagination)
- [ ] **3.5** Soft delete on transactions
- [ ] **3.6** Frontend: VentureSwitcher, VentureListPage, TransactionsPage + form modal
- [ ] **3.7** Type toggle in form shows/hides fields (paidFrom, paidTo, category)

**Exit criteria:** Full transaction lifecycle via UI for one venture.

---

### Phase 4 — Summary, Settlement & Analytics (Day 6)
**Goal:** The Excel replacement math — KPIs and spend-by-user.

- [ ] **4.1** `settlement.service.ts` — fair share math
- [ ] **4.2** `GET /ventures/:id/summary` — pool totals + settlement array
- [ ] **4.3** `GET /ventures/:id/analytics/spend-by-partner`
- [ ] **4.4** `GET /ventures/:id/analytics/spend-by-category`
- [ ] **4.5** Frontend: DashboardPage with KpiCards, pie chart, bar chart, SettlementTable
- [ ] **4.6** Frontend: AnalyticsPage with date range + partner filter + CSV export
- [ ] **4.7** Admin overview analytics endpoint

**Exit criteria:** Dashboard numbers match manual Excel calculation for seed data.

---

### Phase 5 — R2 File Storage (Day 7)
**Goal:** Presigned upload/download, file manager UI.

- [ ] **5.1** R2 client config (graceful degrade if creds missing — mock mode for local dev)
- [ ] **5.2** `POST /files/presign` + `POST /files/confirm`
- [ ] **5.3** `GET /files/:id/download` + `DELETE /files/:id`
- [ ] **5.4** Link attachments to transactions
- [ ] **5.5** Frontend: FileDropzone in transaction modal
- [ ] **5.6** Frontend: FileManagerPage — grid, image preview, download, delete
- [ ] **5.7** MIME + size validation

**Exit criteria:** Upload screenshot → visible in file manager → downloadable via presigned URL.

---

### Phase 6 — Excel Import (Admin) (Day 8)
**Goal:** Bulk import with validation + proof attachments.

- [ ] **6.1** ExcelImport model + routes
- [ ] **6.2** `excel-import.service.ts` — parse, validate, preview
- [ ] **6.3** Commit flow — bulk insert with transaction session
- [ ] **6.4** Link proof screenshots to import record
- [ ] **6.5** Frontend: ExcelImportPage — multi-step wizard
- [ ] **6.6** Error row display with row numbers
- [ ] **6.7** Duplicate detection warnings

**Exit criteria:** Upload sample Excel → validate → commit → transactions appear in venture.

---

### Phase 7 — Audit Log (Day 9)
**Goal:** Every mutation tracked; activity feed in UI.

- [ ] **7.1** `audit.service.ts` + `logAudit()` helper
- [ ] **7.2** Wrap all mutating controllers
- [ ] **7.3** `GET /audit-logs` with filters
- [ ] **7.4** Frontend: ActivityLogPage (partner — own venture)
- [ ] **7.5** Frontend: Admin AuditLogPage (all ventures, full detail)

**Exit criteria:** Create/edit/delete transaction shows in activity feed with before/after.

---

### Phase 8 — Landing Page & App Shell (Day 10)
**Goal:** AAA public face + polished dark dashboard shell.

- [ ] **8.1** LandingPage — Hero, Features, HowItWorks, VentureTypes showcase, Footer
- [ ] **8.2** ApexLedger logo + brand assets
- [ ] **8.3** AppShell — Sidebar, TopNav, Breadcrumbs, venture context tabs
- [ ] **8.4** Responsive sidebar collapse
- [ ] **8.5** Empty states for all list pages
- [ ] **8.6** Loading skeletons on KPI cards
- [ ] **8.7** Toast notifications for success/error

**Exit criteria:** `/` looks like a product landing page; `/app/*` matches dark card UI reference.

---

### Phase 9 — Admin Panel (Day 11)
**Goal:** Full admin section for partners, types, ventures, imports.

- [ ] **9.1** AdminLayout with admin-only nav items
- [ ] **9.2** PartnersPage — list, create, deactivate, reset password
- [ ] **9.3** VentureTypesPage — CRUD with color/icon picker
- [ ] **9.4** Admin ventures management page
- [ ] **9.5** AdminDashboard — cross-venture KPIs
- [ ] **9.6** SettingsPage — change password

**Exit criteria:** Admin can onboard new partner + new venture type without code changes.

---

### Phase 10 — Hardening & Edge Cases (Day 12)
**Goal:** Production-ready error handling, validation, docs.

- [ ] **10.1** Global error middleware + structured error responses
- [ ] **10.2** Input sanitization (NoSQL injection prevention)
- [ ] **10.3** Closed venture + deactivated partner guards
- [ ] **10.4** Orphan R2 key note in README (cleanup script optional)
- [ ] **10.5** API integration smoke tests (supertest)
- [ ] **10.6** Update README: setup, env vars, seed, R2 config
- [ ] **10.7** Manual QA checklist (see below)

**Exit criteria:** All edge cases in Section 12 handled; smoke tests pass.

---

### Manual QA Checklist (Phase 10)

```
□ Login / logout / expired session redirect
□ Partner cannot access /app/admin/*
□ Admin can create partner + venture + venture type
□ Add all 3 transaction types with correct fields
□ Dashboard KPIs match seed totals
□ Settlement table math verified manually
□ Analytics date filter changes chart data
□ Upload image to transaction → appears in file manager
□ Delete attachment removes from R2 (when creds set)
□ Excel import: valid file commits; invalid file shows errors
□ Excel import: proof screenshots linked
□ Soft-deleted transaction hidden from list, visible in audit
□ Closed venture blocks new transactions
□ CSV export downloads correctly
□ Landing page renders on mobile width
□ Dark theme consistent across all pages
```

---

## 16. Definition of Done (v1)

ApexLedger v1 is **done** when:

1. **Landing page** live at `/` with ApexLedger branding
2. **3–5 partners** can log in and see venture dashboard
3. **Any venture type** (Truck, Car, Plot, Jamin, Company) creatable by admin without code
4. **Transactions** CRUD with proof uploads to R2
5. **KPIs + settlement + spend-by-user analytics** match Excel logic
6. **Admin** can bulk import Excel + attach proof screenshots
7. **Audit log** captures all mutations
8. **Dark UI** — card dashboard, sidebar nav, green accent, consistent tokens
9. **Local MongoDB** runs with seed script
10. **R2** works when credentials added; graceful local mock when not

---

## Quick Start (after Phase 0 is built)

```bash
# Prerequisites: Node 20+, MongoDB running locally

git clone <repo>
cd apexledger
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Add R2 creds to apps/api/.env when ready

npm install
npm run seed          # seed DB
npm run dev           # API :4000 + Web :5173

open http://localhost:5173        # landing
open http://localhost:5173/login  # login
```

---

## Appendix A — Landing Page Copy (draft)

**Hero headline:**  
> Partner finance, finally in one place.

**Subhead:**  
> Track contributions, pool payments, and settlements across trucks, plots, cars, and every venture you run together.

**CTA:** `Get Started` → `/login`

**Features (3 cards):**
1. **Multi-Venture Tracking** — One platform for every investment type
2. **Proof & Audit Trail** — Upload receipts, screenshots, Excel — every change logged
3. **Fair Settlement** — Automatic fair-share math, no more spreadsheet disputes

---

## Appendix B — npm Scripts (planned)

```json
{
  "dev": "concurrently \"npm run dev -w api\" \"npm run dev -w web\"",
  "build": "npm run build -w shared && npm run build -w api && npm run build -w web",
  "seed": "npm run seed -w api",
  "test": "npm run test -w api"
}
```

---

*Document version: 1.0 · Created for ApexLedger build · MongoDB + Node.js + R2 + Dark UI*
