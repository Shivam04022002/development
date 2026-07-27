#!/usr/bin/env bash
# cleanup-temp.sh — remove stale staged uploads and temp files.
# Staged files are moved into applications/<id>/ at creation; anything left in
# the staging/temp folders older than RETENTION_DAYS is orphaned and safe to
# delete.
#
# Usage:
#   UPLOADS_ROOT=/var/www/uploads RETENTION_DAYS=2 ./scripts/cleanup-temp.sh
set -euo pipefail

UPLOADS_ROOT="${UPLOADS_ROOT:-./uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-2}"

STAGING="${UPLOADS_ROOT}/applications/_staging"
TEMP="${UPLOADS_ROOT}/temp"

for dir in "${STAGING}" "${TEMP}"; do
  if [ -d "${dir}" ]; then
    echo "[cleanup] pruning files older than ${RETENTION_DAYS}d in ${dir}"
    find "${dir}" -type f -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
    # remove now-empty subdirectories (keep the folder itself)
    find "${dir}" -mindepth 1 -type d -empty -delete 2>/dev/null || true
  fi
done

echo "[cleanup] done."
