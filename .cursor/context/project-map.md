# ApexLedger Project Map

> Last verified: 2026-07-22 (transaction/settlement/analytics deep trace).

## STACK
- **Monorepo:** npm workspaces — root `apexledger`, `apps/api`, `apps/web`
- **API:** Node + Express 4.21 + TypeScript 5.8 + Mongoose 8.12 + Zod 3.24 + JWT (httpOnly cookie `apexledger_token`) + bcryptjs + Multer + Cloudflare R2 (`@aws-sdk/client-s3` 3.758) — scripts: `tsx watch`, `tsc`
- **Web:** React 19 + Vite 6 + React Router 7 + Tailwind 3.4 + Lucide + Recharts 2.15 (no shadcn package; custom CSS utilities)
- **DB:** MongoDB via Mongoose Decimal128 for money
- **Shared package:** not present (types duplicated in `apps/web/src/lib/api.ts`)

## STRUCTURE
- `apps/api/src/` — Express API (`index.ts` → `createApp`, port from env)
- `apps/api/src/models/` — Partner, Venture, VentureType, PartnerVenture, Transaction, Attachment
- `apps/api/src/routes/` — auth, admin, ventures, transactions (nested), files
- `apps/api/src/services/` — settlement, partner-analytics, r2, cascade
- `apps/web/src/pages/` — Landing, Login, Home, Project, PartnerAnalytics, Admin
- `apps/web/src/components/` — forms, project tabs, admin tables, layout, ui
- `partner-tracker-spec.md` / `PROJECT-PLAN.md` — planning docs (Prisma/Postgres & Category not implemented)
- `.cursor/context/` — agent maps/briefs

## ENTRY POINTS
- **API:** `apps/api/src/index.ts` → `createApp()` in `app.ts`; base `/api`
  - `/api/auth`, `/api/admin`, `/api/ventures`, `/api/ventures/:ventureId/transactions`, `/api/files`
- **Web:** `apps/web/src/main.tsx` → `App.tsx`
  - `/` landing, `/login`, `/app` (Home), `/app/project/:id`, `/app/project/:id/partner/:partnerId`, `/app/admin` (admin)

## FEATURES
| Feature | UI → API → Service/DB |
|---------|----------------------|
| Auth JWT cookie | `AuthContext` → `auth.routes` → Partner model; `/me` uses `computePartnerTotalInvested` |
| Add Entry | `AddEntryForm` → `POST /files/upload` then `POST .../transactions` → Transaction + Attachment link |
| Txn list/filter | `ProjectTransactionsTab` → `GET .../transactions` |
| Project KPIs/settlement | `ProjectPage`/`ProjectAnalysisTab` → `GET /ventures/:id/summary` → `computeVentureSummary` |
| Partner analytics + CSV | `PartnerAnalyticsPage` → `.../analytics` + `.../report.csv` → `computePartnerVentureAnalytics` |
| Admin projects | `AdminPage` CreateProjectForm + `ProjectManagementTable` → `POST/PATCH/DELETE /admin/ventures` |
| Assignments | Admin Assign tab → `PartnerVenture` |
| Soft-delete txns | Field `isDeleted` on model — **no route sets it yet** |

## DATA MODEL
- **Partner** — name, email, passwordHash, role (`partner`\|`admin`), isActive
- **VentureType** — label, slug, icon, colorHex, sortOrder, isActive
- **Venture** — name, ventureTypeId, description?, status (`active`\|`closed`), metadata `{}` (unused in CRUD)
- **PartnerVenture** — partnerId, ventureId, assignedById (access + settlement denominator)
- **Transaction** — ventureId, type (`CONTRIBUTION_IN`\|`EXPENSE`\|`VENDOR_PAYMENT_OUT`), partnerId, amount Decimal128, date, paidFrom?, paidTo?, remark?, createdById, isDeleted
- **Attachment** — ventureId, transactionId?, r2Key, file meta; can exist before txn link
- **No:** Category, BankAccount, Earnings/revenue type, AuditLog (planned only)

## CONVENTIONS
- Money: store Decimal128 via `toDecimalString`; API returns `toNumber`
- Auth: `requireAuth` + `requireVentureAccess` (admin bypass) / `requireAdmin`
- Errors: `{ error: string }`; Zod → 400 first message
- Pagination: `parsePagination` / `paginatedResult`
- Web API client: `api()` / `apiUpload()` in `lib/api.ts` (credentials include)
- Entry types: partners get CONTRIBUTION_IN + EXPENSE; VENDOR_PAYMENT_OUT admin-only (UI + API 403)
- Proof required on create (Zod `attachmentIds.min(1)`); paidFrom + remark required

## INTEGRATIONS
- **MongoDB** — `apps/api/src/config/db.ts`
- **R2 / local mock** — `r2.service.ts`; keys `ventures/{ventureId}/proofs/{uuid}-{name}`; direct upload via Multer when R2 unset

## GOTCHAS
- `VENDOR_PAYMENT_OUT` hits `poolOutTotal` only — **excluded from** `totalContributed` / fair-share
- `activePartnerCount = max(PartnerVenture assignments, 1)` — not distinct txn partners; unassigned txn partners still appear in byPartner
- `paidFrom` is free-text only — no Venture bank fields; `metadata` never written by admin create/patch
- No earnings/income transaction type anywhere in code
- No PATCH/DELETE transaction endpoints despite `isDeleted`
- Spec/plan Category + byCategory analytics not built
- Analysis settlement table: `showSettlement={user?.role === 'admin'}` only
- Admin can pass `partnerId` on txn create; AddEntryForm does not expose it (always current user)
- Seed only creates CONTRIBUTION_IN samples
- Settlement uses JS number math after Decimal128→number (float risk for large INR)
