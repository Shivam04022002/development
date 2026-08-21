#!/usr/bin/env bash
# deploy.sh — pull, install, build, reload, verify. Run from the repo root on the
# production host.
#
# Usage:  ./scripts/deploy.sh [git-ref]
set -euo pipefail

REF="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "[deploy] repo: ${ROOT}"

# 1) Record current commit for rollback.
git rev-parse HEAD > .deploy-last-good 2>/dev/null || true

# 2) Fetch + checkout.
git fetch --all --tags
if [ -n "${REF}" ]; then git checkout "${REF}"; fi
git pull --ff-only || true

# 3) Install + build.
echo "[deploy] admin-backend deps"
( cd admin/admin-backend && npm ci --omit=dev )
echo "[deploy] mobile-backend deps"
( cd native-app/backend/server && npm ci --omit=dev )
echo "[deploy] admin-frontend build"
( cd admin/admin-frontend && npm ci && npm run build )

# 4) Publish the built frontend to the Nginx web root.
#
# The build above only produces admin/admin-frontend/dist/. Nginx serves the
# SPA from /var/www/dealeradmin, and nothing copied one to the other, so a
# deploy would rebuild the frontend and still leave the live site on the
# previous bundle. This is the step that actually releases the UI.
# --delete keeps the web root an exact mirror of the build so superseded
# hashed assets do not accumulate.
echo "[deploy] publishing frontend"
sudo -u www-data rsync -a --delete admin/admin-frontend/dist/ /var/www/dealeradmin/

# 5) Reload under PM2 (zero-downtime).
echo "[deploy] reloading PM2"
pm2 reload ecosystem.config.cjs --env production || pm2 start ecosystem.config.cjs --env production
pm2 save

# 6) Verify.
echo "[deploy] healthcheck"
sleep 3
./scripts/healthcheck.sh || { echo "[deploy] HEALTHCHECK FAILED — consider ./scripts/rollback.sh"; exit 1; }

echo "[deploy] done."
