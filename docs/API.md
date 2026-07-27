# API Reference — DealerMitra V2

## Conventions
- JSON over HTTPS. Base paths: Admin Backend `…/api`, Mobile Backend `…/api`.
- Auth: `Authorization: Bearer <JWT>` unless noted. Admin routes use admin
  tokens; mobile routes use dealer tokens.
- Monitoring (both backends, public): `GET /health`, `/health/db`,
  `/health/storage`.

## Authentication
- **Admin/staff:** `POST /api/auth/login` → `{ token, admin, isSuperAdmin }`.
- **Dealer:** mobile `POST /api/auth/login` → `{ token, user }`.
- JWTs are validated by `protect` (admin) / `requireAuth` (mobile). Passwords
  are bcrypt-hashed. Logout is client-side (stateless JWT).

## Admin Backend

### Applications
- `POST /api/applications` — create ONE application (server-to-server; requires
  `x-internal-api-key` + dealer headers). Runs CIBIL; returns dealer outcome.

### Workflow
- `GET /api/workflow/stages` — stage config (public).
- `GET /api/workflow/stats` · `GET /api/workflow/dashboard-stats` — dashboard.
- `GET /api/workflow/pending` · `/pending/:id` — pending list/detail.
- `GET /api/workflow/pending-cibil` — Pending CIBIL list (permission-gated).
- `GET /api/workflow/:id` — application detail.
- `PATCH /api/workflow/workflow/update/:id` — advance stage.
- `POST /api/workflow/approve/:id` · `/reject/:id` · `/bulk-approve` ·
  `/bulk-reject`.
- `GET /api/workflow/applications/approved` · `/applications/rejected`
  (`?reason=` filter) · `/:id` detail.
- `GET /api/workflow/applications/:id/history` · `/:id/timeline`.
- List search: `?search=` (formId, applicant name/mobile/PAN/Aadhaar, dealer,
  branch — input escaped), `?branch=`, `?page=`, `?limit=`.

### Credit Notes
- `GET /api/credit-notes/:applicationId` — prefill + saved note.
- `POST /api/credit-notes/:applicationId` — save + generate/store PDF + advance
  `pending_cibil → contact creation` (Pending CIBIL permission required).

### System Settings (super-admin)
- `GET /api/settings/cibil` — masked config. `PUT /api/settings/cibil` — update
  (secrets encrypted; never returned).

### Super Admin / Staff
- `/api/superadmin/admins` · `/dealers` · `/dashboard/*` · `/files/:type` ·
  `/applications/revoke` (super-admin only).
- `/api/admin/profile` · `/api/admin/workflow` — current admin + assigned stages.
- `/api/branches` · `/api/form-tracking/*`.

### Files
- `GET /api/files/<relative-path>` — secure download (auth; traversal-safe).

## Mobile Backend
- `POST /api/applications/submit` — forwards to the Admin Backend; returns
  `{ success, status, [reason, message] }`.
- `GET /api/applications/pending` · `/by-formid/:formId`.
- `POST /api/upload` — store a document locally → `{ url, path }`.
- `GET /api/files/<relative-path>` — secure download (auth).
- `GET /files/<image-path>` — **public images only** (non-image files 404).
- Reads: `/api/pending-files`, `/api/rejected`, `/api/approved-files`,
  `/api/profile`, `/api/notifications`.

## Error Handling
- `400` validation · `401` unauthenticated · `403` forbidden / rate-limited
  origin · `404` not found · `409` conflict · `422` unprocessable ·
  `429` rate limited · `5xx` server. Errors return `{ error | message }`;
  stack traces are suppressed in production.
