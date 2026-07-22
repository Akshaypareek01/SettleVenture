# Partner Investment & Expense Tracker — Build Spec

Use this as the prompt for Claude Code. Copy-paste as-is or trim per phase.

## What this replaces
The Excel tracker (Contributions IN → Pool Account → Vendor Payments OUT, plus direct
Expenses, plus Settlement). Same logic, now generalized beyond "truck" into any
number of ventures/projects, with file uploads and audit logs.

## Stack (decision — change only if you have a reason)
- **Backend:** Node.js + Express + TypeScript
- **DB:** PostgreSQL + Prisma (you already know this combo)
- **File storage:** Cloudflare R2 (S3-compatible) via `@aws-sdk/client-s3` + presigned URLs
- **Frontend:** React + Vite + Tailwind + Recharts
- **Auth:** JWT, simple email+password. 3–5 users max, don't over-engineer roles.

**Given your time constraints (solo + full-time job):** consider Next.js instead of
separate Express backend — one repo, one deploy, API routes double as your backend.
Same Node.js runtime, half the DevOps. Only stay split if you specifically want the
API reusable elsewhere (e.g. a future mobile app).

## Core concept: generalize "Truck" → "Venture"
Everything the truck example needed (partners, pool account, categories, settlement)
should work for *any* venture — a new truck, an office setup, a bulk purchase — without
touching code. Ventures and categories are data, not hardcoded enums.

---

## Data Model (Prisma schema outline)

```prisma
model Partner {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  passwordHash String
  createdAt DateTime @default(now())
  transactions Transaction[]
  auditLogs AuditLog[]
}

model Venture {
  id          String   @id @default(cuid())
  name        String              // "Truck 1", "Office Setup"
  description String?
  status      String   @default("active")  // active | closed
  createdAt   DateTime @default(now())
  categories  Category[]
  transactions Transaction[]
}

model Category {
  id        String   @id @default(cuid())
  ventureId String?             // null = global category, usable across ventures
  venture   Venture? @relation(fields: [ventureId], references: [id])
  name      String              // "Fuel", "Truck Body", "Booking"
  type      TransactionType     // which transaction types this category applies to
}

enum TransactionType {
  CONTRIBUTION_IN     // partner -> pool account
  VENDOR_PAYMENT_OUT  // pool account -> vendor
  EXPENSE             // partner -> direct spend, not through pool
}

model Transaction {
  id          String   @id @default(cuid())
  ventureId   String
  venture     Venture  @relation(fields: [ventureId], references: [id])
  type        TransactionType
  partnerId   String              // who paid / who deposited
  partner     Partner  @relation(fields: [partnerId], references: [id])
  amount      Decimal
  date        DateTime
  paidFrom    String?             // free text: "Personal Account", "HDFC", pool account name
  paidTo      String?             // vendor name / pool account name
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  remark      String?
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  attachments Attachment[]
}

model Attachment {
  id            String   @id @default(cuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  r2Key         String              // path in R2 bucket
  fileName      String
  fileType      String
  fileSizeBytes Int
  uploadedById  String
  uploadedAt    DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  partnerId  String
  partner    Partner  @relation(fields: [partnerId], references: [id])
  action     String              // "created", "updated", "deleted"
  entityType String              // "Transaction", "Attachment", "Venture"
  entityId   String
  before     Json?
  after      Json?
  timestamp  DateTime @default(now())
}
```

---

## API Endpoints

```
POST   /api/auth/login
POST   /api/auth/register          (admin-only, invite-based — don't build open signup)

GET    /api/ventures
POST   /api/ventures
GET    /api/ventures/:id
PATCH  /api/ventures/:id

GET    /api/ventures/:id/categories
POST   /api/ventures/:id/categories

GET    /api/ventures/:id/transactions?type=&partnerId=&categoryId=&from=&to=
POST   /api/ventures/:id/transactions
PATCH  /api/transactions/:id
DELETE /api/transactions/:id       (soft-delete, keep audit trail)

POST   /api/files/presign          → { uploadUrl, r2Key }  (client uploads direct to R2)
POST   /api/files/confirm          → save Attachment row after upload succeeds
DELETE /api/files/:id              (deletes from R2 + DB, logs to AuditLog)
GET    /api/files/:id/download     → returns presigned GET url

GET    /api/ventures/:id/summary   → KPIs (see below)
GET    /api/audit-logs?entity=&entityId=
```

## Summary/KPI endpoint — response shape

```json
{
  "poolInTotal": 450000,
  "poolOutTotal": 360000,
  "poolBalance": 90000,
  "byPartner": [
    { "partnerId": "...", "name": "Akshay", "depositedToPool": 280000, "directExpenses": 1565, "totalContributed": 281565, "pctOfTotal": 0.59 }
  ],
  "byCategory": [
    { "category": "Truck Body", "type": "VENDOR_PAYMENT_OUT", "amount": 310000 }
  ],
  "settlement": [
    { "partnerId": "...", "name": "Akshay", "contributed": 281565, "fairShare": 158047, "netBalance": 123518, "status": "owed_by_group" }
  ]
}
```
Settlement math: `fairShare = totalContributed_all / partnerCount`, `netBalance = contributed - fairShare`.

---

## R2 setup
- One bucket, folder-per-venture: `{ventureId}/{transactionId}/{uuid}-{filename}`
- Upload flow: frontend asks backend for a presigned PUT URL → uploads directly to R2 →
  confirms with backend to write the `Attachment` row. Don't proxy file bytes through
  your Node server — R2 egress + your server bandwidth both suffer for no reason.
- Delete flow: backend deletes R2 object + DB row in one transaction, writes AuditLog.

## Frontend pages (MVP)
1. **Login**
2. **Venture switcher** (dropdown/sidebar — pick "Truck 1" vs future ventures)
3. **Dashboard** — KPI cards (pool balance, total contributed, total spent) +
   pie chart (per-partner %) + bar chart (category spend) + settlement table
4. **Transactions** — filterable table, add/edit modal with file drop-zone,
   type toggle (Contribution / Vendor Payment / Expense) that shows relevant fields only
5. **File Manager** — grid of all attachments for the venture, thumbnail preview for
   images, download + delete buttons
6. **Activity Log** — timestamped feed of who did what (from AuditLog)

## Build order (given your bandwidth — do this in phases, not all at once)
1. Prisma schema + migrations + seed script (3 partners, 1 venture "Truck 1", categories)
2. Auth + Transactions CRUD API (no files yet) — get this fully working first
3. Summary endpoint with the settlement math — this is the part that actually replaces Excel
4. Dashboard + Transactions frontend pages
5. R2 presigned upload/delete + File Manager page
6. Audit log (wrap every mutating endpoint in a small `logAudit()` helper)

Skip auth roles, multi-tenant orgs, and notification systems for v1 — 3–5 partners on
one shared login tier is enough.
