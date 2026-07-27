#!/usr/bin/env bash
# healthcheck.sh — verify both backends, MongoDB, storage, disk and PM2.
# Exits non-zero if any critical check fails (usable from cron / monitoring).
#
# Usage:
#   ADMIN_URL=http://127.0.0.1:5001 MOBILE_URL=http://127.0.0.1:5000 \
#   UPLOADS_ROOT=/var/www/uploads DISK_MAX=90 ./scripts/healthcheck.sh
set -uo pipefail

ADMIN_URL="${ADMIN_URL:-http://127.0.0.1:5001}"
MOBILE_URL="${MOBILE_URL:-http://127.0.0.1:5000}"
UPLOADS_ROOT="${UPLOADS_ROOT:-/var/www/uploads}"
DISK_MAX="${DISK_MAX:-90}"
FAIL=0

check() { # name url
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$2" || echo 000)"
  if [ "$code" = "200" ]; then echo "  OK   $1 ($2)"; else echo "  FAIL $1 ($2) → HTTP $code"; FAIL=1; fi
}

echo "== HTTP / DB / Storage health =="
check "admin /health"          "${ADMIN_URL}/health"
check "admin /health/db"       "${ADMIN_URL}/health/db"
check "admin /health/storage"  "${ADMIN_URL}/health/storage"
check "mobile /health"         "${MOBILE_URL}/health"
check "mobile /health/db"      "${MOBILE_URL}/health/db"
check "mobile /health/storage" "${MOBILE_URL}/health/storage"

echo "== Uploads storage =="
if [ -d "${UPLOADS_ROOT}" ] && [ -w "${UPLOADS_ROOT}" ]; then
  echo "  OK   uploads root writable (${UPLOADS_ROOT})"
else
  echo "  FAIL uploads root missing or not writable (${UPLOADS_ROOT})"; FAIL=1
fi

echo "== Disk usage =="
USE="$(df -P "${UPLOADS_ROOT}" 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
if [ -n "${USE:-}" ]; then
  if [ "${USE}" -lt "${DISK_MAX}" ]; then echo "  OK   disk ${USE}% (< ${DISK_MAX}%)"; else echo "  FAIL disk ${USE}% (>= ${DISK_MAX}%)"; FAIL=1; fi
fi

echo "== PM2 =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist >/dev/null 2>&1 && echo "  OK   pm2 daemon responsive" || { echo "  FAIL pm2 not responsive"; FAIL=1; }
  for app in admin-backend mobile-backend; do
    status="$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"${app}\"[^}]*\"status\":\"[a-z]*\"" | grep -o 'online' | head -1 || true)"
    [ "${status}" = "online" ] && echo "  OK   ${app} online" || { echo "  FAIL ${app} not online"; FAIL=1; }
  done
else
  echo "  WARN pm2 not installed on this host"
fi

echo ""
[ "${FAIL}" -eq 0 ] && echo "HEALTHCHECK: PASS" || echo "HEALTHCHECK: FAIL"
exit "${FAIL}"
