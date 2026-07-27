# DealerMitra V2

Loan application and workflow management platform for dealer-originated
financing — mobile submission, automated CIBIL evaluation, staff workflow, and
an admin analytics panel.

## Project Overview

Dealers submit loan applications from a mobile app. The **Mobile Backend**
authenticates the dealer and forwards the submission to the **Admin Backend**,
which is the single source of truth: it creates the application, runs CIBIL
(Xaler / TransUnion) evaluation, applies auto-reject rules, and drives the
workflow (Pending CIBIL → Credit Note → Contact Creation → … → Disbursed). Staff
manage applications through the **Admin Frontend** web panel.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Tech Stack

| Layer          | Technology |
|----------------|------------|
| Admin Backend  | Node.js (ESM), Express 5, Mongoose 8, JWT |
| Mobile Backend | Node.js (ESM), Express 5, Mongoose 8, Cloudinary |
| Admin Frontend | React 19, Vite 7, React Router 7, TanStack Query, Recharts, Bootstrap |
| Mobile App     | Expo, React Native |
| Database       | MongoDB |
| Process / Proxy| PM2, Nginx |

## Folder Structure

```
dealerMitra/
├── admin/
│   ├── admin-backend/     Admin API (source of truth) — port 5001
│   ├── admin-frontend/    React admin SPA
│   ├── ecosystem.config.cjs  PM2 config
│   └── nginx.conf         Reverse-proxy config
├── native-app/
│   ├── backend/server/    Mobile gateway API — port 5000
│   └── DealerLogin/        Expo dealer app
├── docs/                  Architecture & reference docs
├── scripts/               Operational scripts
├── uploads/               Local upload storage (git-ignored)
└── README.md
```

## Installation

Requires **Node.js 18+** (20/22 recommended), **npm**, and **MongoDB**.

```bash
# Admin Backend
cd admin/admin-backend && npm install

# Admin Frontend
cd ../admin-frontend && npm install

# Mobile Backend
cd ../../native-app/backend/server && npm install

# Mobile App
cd ../../DealerLogin && npm install
```

## Environment Variables

Copy each `.env.example` to `.env` and fill in local values (never commit real
secrets):

- `admin/admin-backend/.env.example`
- `admin/admin-frontend/.env.example`
- `native-app/backend/server/.env.example`
- `native-app/DealerLogin/.env.example`

Key variables include `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`,
`SETTINGS_ENC_KEY` (credential encryption), `INTERNAL_API_KEY` +
`ADMIN_BACKEND_URL` (mobile→admin gateway), and the frontend `VITE_API_BASE_URL`.

## Development

```bash
# Admin Backend  (http://localhost:5001)
cd admin/admin-backend && npm run dev

# Admin Frontend (http://localhost:5173)
cd admin/admin-frontend && npm run dev

# Mobile Backend (http://localhost:5000)
cd native-app/backend/server && npm run dev

# Mobile App
cd native-app/DealerLogin && npm start
```

## Deployment

Production runs both backends under **PM2** (`admin/ecosystem.config.cjs`) and
serves the built admin frontend + proxies the APIs via **Nginx**
(`admin/nginx.conf`). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

**Monitoring:** each backend exposes `GET /health`, `/health/db`,
`/health/storage`. **Backups:** `scripts/backup-mongodb.sh`,
`scripts/restore-mongodb.sh`, `scripts/backup-uploads.sh`. Both backends apply
secure headers, rate limiting, and structured JSON event logs.

## Workflow

`status` is the overall state; `workflowStage` drives the pipeline:

```
pending_cibil → contact creation → house visit → document collection
→ credit sanction → agreement → pre-disbursement documentation → disbursed
```

New applications enter at `pending_cibil`. Completing the **Credit Note**
advances them to `contact creation`. Low-CIBIL auto-rejections go to the
Rejected module. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## License

Proprietary — © Surjit Finance. All rights reserved.
