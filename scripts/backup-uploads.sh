#!/usr/bin/env bash
# backup-uploads.sh — archive the local uploads directory to a timestamped
# tarball.
#
# Usage:
#   UPLOADS_ROOT="/var/www/uploads" ./scripts/backup-uploads.sh [BACKUP_DIR]
#
# Defaults UPLOADS_ROOT to the repo-level ./uploads.
set -euo pipefail

UPLOADS_ROOT="${UPLOADS_ROOT:-./uploads}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups/uploads}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/uploads-${STAMP}.tar.gz"

if [ ! -d "${UPLOADS_ROOT}" ]; then
  echo "ERROR: uploads directory not found: ${UPLOADS_ROOT}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
echo "[backup] archiving ${UPLOADS_ROOT} → ${OUT}"
tar -czf "${OUT}" -C "$(dirname "${UPLOADS_ROOT}")" "$(basename "${UPLOADS_ROOT}")"

# Retention: keep the 14 most recent archives.
ls -1t "${BACKUP_DIR}"/uploads-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "[backup] done: ${OUT}"
