# ApexLedger

Partner investment & expense tracker — MongoDB, Express, React, dark UI.

## Prerequisites

- Node.js 20+
- MongoDB running locally (`mongod`)

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env   # if .env missing
npm run seed
npm run dev
```

- **Web:** http://localhost:5173
- **API:** http://localhost:4000/api/health

## Demo Logins

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@apexledger.local | Admin123! |
| Partner | partner1@apexledger.local | Partner123! |

(Akshay, Rahul, Priya — partner1/2/3@apexledger.local)

## Features

- **Partners:** See assigned projects, log investments (amount + bank + reason + screenshot), view all partners' investments, download documents
- **Admin:** Create users, projects (Truck/Car/Plot/Jamin/Company), assign partners, view settlement

## R2 Storage

Required. Set `R2_ENDPOINT`, keys, `R2_BUCKET_NAME`, and `R2_PUBLIC_BASE_URL`
(`https://pub-….r2.dev` from Cloudflare R2 → bucket → Public access — **not** the S3 API host).
Proofs are stored in R2 only; no local `uploads/` fallback.

## Project Structure

```
apps/api/     Express + Mongoose backend
apps/web/     React + Vite frontend
```
# SettleVenture
