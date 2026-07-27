# Architecture — DealerMitra V2

This document describes the current V2 implementation.

## Overall Architecture

DealerMitra V2 consists of four applications backed by a single shared MongoDB
database:

```
 Dealer Mobile App (Expo / React Native)
          │  HTTPS (JWT)
          ▼
 Mobile Backend  (Node/Express, port 5000)      ── GATEWAY ONLY
          │  server-to-server (x-internal-api-key + dealer headers)
          ▼
 Admin Backend   (Node/Express, port 5001)      ── SINGLE SOURCE OF TRUTH
          ▲
          │  HTTPS (JWT)
 Admin Frontend  (React 19 + Vite 7 SPA)
```

- **Admin Backend** is the only writer of loan applications and owns all
  business logic: application creation, validation, CIBIL processing, Credit
  Note, workflow, dealer/branch resolution, and permissions.
- **Mobile Backend** is a stateless gateway: it authenticates the dealer and
  forwards the complete submission to the Admin Backend. It does not write
  application data to MongoDB.
- **Admin Frontend** is the staff/super-admin web panel.
- **Mobile App** is the dealer-facing Expo app.

Both backends connect to the same MongoDB, so collections are shared.

## Admin Backend

- **Location:** `admin/admin-backend`
- **Runtime:** Node.js (ESM), Express 5, Mongoose 8. Default port **5001**.
- **Responsibilities:**
  - `POST /api/applications` — create exactly one `Application` document.
  - CIBIL processing (Xaler TransUnion) immediately after creation.
  - Credit Note module (`/api/credit-notes`).
  - Workflow list/detail/transition endpoints (`/api/workflow/*`).
  - Staff & super-admin management (`/api/superadmin/*`, `/api/admin/*`).
  - System Settings / CIBIL configuration (`/api/settings/*`, super-admin only).
- **Key entry point:** `server.js` → `startServer()` connects the DB and mounts routes.

## Mobile Backend

- **Location:** `native-app/backend/server`
- **Runtime:** Node.js (ESM), Express 5, Mongoose 8. Default port **5000**.
- **Responsibilities:**
  - Dealer authentication (`requireAuth`, JWT).
  - `POST /api/applications/submit` → forwards the payload to the Admin Backend
    (`services/adminApplicationService.js`).
  - Read endpoints the dealer app consumes (pending/approved/rejected/profile/
    notifications), served from the shared collections.
  - Media uploads via **Cloudinary** (`multer-storage-cloudinary`).
- It never creates `Application` documents directly.

## Application Flow

```
Dealer App
  → POST /api/applications/submit           (Mobile Backend: auth only)
  → POST /api/applications                  (Admin Backend, forwarded)
      1. createApplication() → ONE Application document
         status = "pending", workflowStage = "pending_cibil"
      2. CIBIL processing (Xaler) runs immediately
      3. dealer response: { success, status, [reason, message] }
```

- One submission = one `Application` document (no separate Applicant/
  CoApplicant/Vehicle collections, no merge step — those were removed in V2).
- The Application embeds `applicant`, `coApplicant`, `vehicleDetails`,
  `documents`, `dealer`/`dealerDetails`, `branch`, plus workflow/audit fields.

## Workflow Stages

Pending CIBIL is a **workflow stage**, not a status. `status` represents the
overall state; `workflowStage` drives the pipeline.

Ordered stages (`utils/workflowConstants.js`):

1. `pending_cibil` (entry stage)
2. `contact creation`
3. `house visit`
4. `document collection`
5. `credit sanction`
6. `agreement`
7. `pre-disbursement documentation`
8. `disbursed` (final)

State mapping:

| Situation            | status     | workflowStage    |
|----------------------|------------|------------------|
| New application      | `pending`  | `pending_cibil`  |
| After Credit Note    | `pending`  | `contact creation` |
| Final approval       | `approved` | `disbursed`      |
| Rejected / auto-reject | `rejected` | `rejected`     |

Applications at `pending_cibil` appear only in the Pending CIBIL list; rejected
applications live in the Rejected module.

## CIBIL Processing

- **Integration:** Xaler "Advanced Unified Flow" TransUnion API
  (`services/xalerCibilService.js`), called via built-in `fetch` with **retry**,
  **timeout**, and defensive response parsing. It never throws.
- **Credentials:** read (decrypted) from **System Settings** — never hardcoded.
- **Orchestration:** `services/cibilProcessingService.js` runs after the
  Application is persisted:
  - Stores a quick-access **summary** on `Application.cibil`
    (`score, status, state, reportDate, requestId, fetchedAt`).
  - Stores the **complete raw request/response** in the `CibilReport` collection.
  - Applies the minimum-score rule: if `score < minimumScore` and
    `autoRejectLowCibil` is on → move the record to the Rejected module
    (`status: rejected`, `workflowStage: rejected`, `rejectedBy: System`).
  - Otherwise the application stays at `pending_cibil`.
  - On vendor failure → stays Pending CIBIL (`cibil.state: "unavailable"`).
- Creation is never blocked by a CIBIL failure.

## Credit Note

- **Location:** `controllers/creditNoteController.js`, `models/CreditNote.js`,
  `utils/creditNotePdf.js`.
- The final step of the Pending CIBIL stage. Only staff with the `pending_cibil`
  permission (or super-admin) may complete it.
- **Update & Download** (`POST /api/credit-notes/:applicationId`):
  1. Saves the Credit Note (Customer Name / Address / CIBIL Score prefilled from
     the Application; other fields entered by staff).
  2. Generates a PDF (dependency-free generator).
  3. Stores it at `uploads/credit-notes/<APPNO>/credit-note.pdf`.
  4. Returns the PDF for download.
  5. Advances `workflowStage` `pending_cibil → contact creation` (status stays
     `pending`).
  6. Records an ApplicationHistory entry "Credit Note Completed".

## Permission System

- No dedicated per-feature roles. Access is governed by the existing **Staff
  Management** model: each `Admin` has a `workflows` array of the workflow
  stages they may handle.
- `pending_cibil` is an assignable stage permission, so Pending CIBIL access is
  granted like any other stage.
- `super-admin` sees everything; a regular admin's Pending/Pending-CIBIL lists
  are filtered to their assigned stages (`utils/accessFilter.js`).
- Roles are limited to `admin` and `superadmin` (`models/Admin.js`).

## ApplicationHistory

- **Collection:** `applicationHistories` (`models/ApplicationHistory.js`).
- An append-only audit log per application. Action types include
  `FORM_CREATED`, `CIBIL_REQUESTED`, `CIBIL_RESPONSE_RECEIVED`, `CIBIL_PENDING`,
  `STAGE_CHANGED`, `APPROVED`, `REJECTED`, and comments.
- Drives the Application Details **Timeline**
  (`GET /api/workflow/applications/:id/timeline`, chronological).

## CibilReport

- **Collection:** `cibilreports` (`models/CibilReport.js`), one document per
  application.
- Holds the **internal** vendor record: `rawRequest` (no secrets), `rawResponse`,
  `reportUrl`, `requestId`, `vendor`. It is never exposed through the
  application-facing APIs or the UI (no raw JSON / report URL is shown).

## Upload Storage

- **Dealer media** (photos, Aadhaar/PAN images, vehicle photos) → **Cloudinary**,
  handled by the Mobile Backend; the Application stores the resulting URLs.
- **Credit Note PDFs** and **CIBIL raw JSON** → the application folder
  (`applications/<AppNo>/credit-note.pdf`, `applications/<AppNo>/cibil/
  raw-response.json`).
- MongoDB stores **relative** paths only; secure downloads are served behind
  authentication at `GET /api/files/*` (both backends), with a public `/files`
  route on the Mobile Backend for image display.

## Production Hardening (Phase 8)

- **Security:** secure HTTP headers (helmet-equivalent) + in-memory rate
  limiting on both backends (`middleware/security.js`); JWT auth on protected
  routes; internal-key auth on the gateway; encrypted CIBIL credentials; upload
  type/size validation and path-traversal-safe file serving.
- **Monitoring:** `GET /health`, `/health/db`, `/health/storage` on both
  backends.
- **Logging:** structured single-line JSON events (`utils/log.js`) for
  application-created, CIBIL request/response, workflow-changed, credit-note
  completed, login, server errors, and unhandled exceptions.
- **Backups:** `scripts/backup-mongodb.sh`, `restore-mongodb.sh`,
  `backup-uploads.sh`.
