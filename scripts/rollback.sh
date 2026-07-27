#!/usr/bin/env bash
# rollback.sh — revert to the previous good commit (recorded by deploy.sh) or a
# supplied ref, reinstall, rebuild, reload, verify.
#
# Usage:  ./scripts/rollback.sh [git-ref]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

REF="${1:-}"
if [ -z "${REF}" ]; then
  if [ -f .deploy-last-good ]; then REF="$(cat .deploy-last-good)"; else
    echo "ERROR: no ref supplied and no .deploy-last-good found." >&2; exit 1; fi
fi

echo "[rollback] checking out ${REF}"
git checkout "${REF}"

( cd admin/admin-backend && npm ci --omit=dev )
( cd native-app/backend/server && npm ci --omit=dev )
( cd admin/admin-frontend && npm ci && npm run build )

pm2 reload ecosystem.config.cjs --env production
pm2 save

sleep 3
./scripts/healthcheck.sh || { echo "[rollback] healthcheck still failing — investigate."; exit 1; }
echo "[rollback] done — now on ${REF}"
