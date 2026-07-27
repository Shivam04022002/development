# Release Notes — DealerMitra V2

## V2.0.0 — Production Go-Live

### Highlights
- **Single source of truth:** the Admin Backend creates each application in one
  write; the Mobile Backend is a stateless gateway (no more merge subsystem).
- **CIBIL (Xaler / TransUnion):** automated evaluation with retry/timeout,
  minimum-score auto-reject, and a summary-on-application / raw-on-disk split.
- **Pending CIBIL workflow stage** + Credit Note completion (PDF) advancing to
  Contact Creation. Permissions via Staff Management (no dedicated roles).
- **Admin analytics:** dashboard cards, charts, date filters, Excel export,
  timeline, rejected-reason filters, and multi-field search.
- **Local file storage** (Cloudinary removed): documents under
  `uploads/applications/<AppNo>/…`, relative paths in Mongo, secure downloads.

### Production hardening
- Secure headers + rate limiting on both backends; encrypted CIBIL credentials;
  structured JSON event logs; health endpoints (`/health`, `/health/db`,
  `/health/storage`).
- Security fixes: restricted the public file route to images only (CIBIL JSON /
  Credit Note PDFs are auth-only); escaped all user-supplied regex inputs
  (search/branch/formId) to remove injection / ReDoS.
- Removed unused packages (`openai`, `firebase-admin`, `cookie-parser`,
  `@types/multer`) and debug/credential-leaking logs.
- Tuned MongoDB connection pool + timeouts.

### Go-live artifacts
- `ecosystem.config.cjs` (PM2), `nginx.production.conf`, `.env.production.example`
  for all four apps.
- Scripts: `deploy.sh`, `rollback.sh`, `restart.sh`, `healthcheck.sh`,
  `backup-mongodb.sh`, `restore-mongodb.sh`, `backup-uploads.sh`,
  `cleanup-temp.sh`.

### Upgrade / deploy notes
- Set `UPLOADS_ROOT` (shared) and matching `INTERNAL_API_KEY` on both backends;
  set `SETTINGS_ENC_KEY` (64 hex) on the Admin Backend; set `FILE_PUBLIC_BASE`
  on the Mobile Backend.
- Run `npm ci`/`npm prune` on both backends to drop removed packages.
- Legacy Cloudinary URLs on existing records remain valid.
