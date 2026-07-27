# Deployment — DealerMitra V2

## Prerequisites
- Node.js 18+ (20/22 recommended), npm
- MongoDB (Atlas or self-hosted)
- PM2, Nginx, Certbot (Let's Encrypt)
- MongoDB Database Tools (`mongodump`/`mongorestore`) for backups

## Environment Variables
Copy each `.env.example` → `.env`:
- `admin/admin-backend`: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
  `CORS_ORIGIN`, `SETTINGS_ENC_KEY` (64 hex), `INTERNAL_API_KEY`, `UPLOADS_ROOT`.
- `native-app/backend/server`: `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`,
  `ADMIN_BACKEND_URL`, `INTERNAL_API_KEY`, `UPLOADS_ROOT`, `FILE_PUBLIC_BASE`.
- `admin/admin-frontend`: `VITE_API_BASE_URL`.

`UPLOADS_ROOT` must be the **same absolute path** for both backends (they run on
the same host and share the uploads tree). `INTERNAL_API_KEY` must match between
the two backends.

Use `.env.production.example` in each app as the template. Production values are
also set (non-secret) in the root `ecosystem.config.cjs`.

## PM2 (both backends)
Use the root `ecosystem.config.cjs`:
```
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup
```
Admin Backend → 5001, Mobile Backend → 5000. Health: `GET /health`,
`/health/db`, `/health/storage`. Policies: `autorestart`, `max_memory_restart
500M`, exponential backoff, `max_restarts 10`, `min_uptime 15s`.

## Admin Frontend (build + Nginx)
```
cd admin/admin-frontend && npm ci && npm run build   # → dist/
```
Serve `dist/` statically via Nginx.

## Nginx Configuration
Use `nginx.production.conf` (three hosts: admin SPA static, admin API → 5001,
mobile API → 5000). It includes gzip compression, 1-year immutable caching for
static assets, per-zone rate limiting (auth/admin/mobile), security headers,
`client_max_body_size 15m`, the **public images** route (`/files/` → mobile,
30-day cache) and **secure downloads** (`/api/files` proxied with the rest of
`/api`). The backend already restricts `/files` to images only.

## Deployment scripts (`scripts/`)
`deploy.sh` (pull → `npm ci` → build → `pm2 reload` → healthcheck),
`rollback.sh` (revert to last-good/ref), `restart.sh` (zero-downtime reload),
`healthcheck.sh` (HTTP/DB/storage/disk/PM2). Backups: `backup-mongodb.sh`,
`restore-mongodb.sh`, `backup-uploads.sh`; housekeeping: `cleanup-temp.sh`
(prune stale staged uploads).

## Logging structure
PM2 writes separate streams per app to `${PM2_LOG_DIR:-/var/www/logs}`:
`*-out.log` (application/access), `*-error.log` (errors), `*-combined.log`.
Application events are structured single-line JSON. Nginx access/error logs live
under `/var/log/nginx/`. Rotate with `pm2 install pm2-logrotate` and logrotate.

## MongoDB
Use an Atlas connection string or a hardened self-hosted instance. Ensure
indexes build on first boot (Mongoose creates them from the schemas).

## SSL / Certificates
Issue/renew via Certbot; certificates referenced in `nginx.conf`
(`/etc/letsencrypt/live/...`).

## Backups
Cron the scripts in `scripts/`:
```
MONGO_URI=... ./scripts/backup-mongodb.sh /var/backups/mongo
UPLOADS_ROOT=/var/www/uploads ./scripts/backup-uploads.sh /var/backups/uploads
```
Restore with `./scripts/restore-mongodb.sh <archive.gz> [--drop]`.

## Rollback
PM2 keeps the previous process; redeploy the prior build and
`pm2 reload ecosystem.config.cjs`. Restore data from the latest verified backup
if needed.
