#!/usr/bin/env bash
# backup-mongodb.sh — dump the MongoDB database to a timestamped gzip archive.
#
# Usage:
#   MONGO_URI="mongodb+srv://..." ./scripts/backup-mongodb.sh [BACKUP_DIR]
#
# Requires: mongodump (MongoDB Database Tools).
set -euo pipefail

MONGO_URI="${MONGO_URI:-}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups/mongodb}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/mongo-${STAMP}.archive.gz"

if [ -z "${MONGO_URI}" ]; then
  echo "ERROR: MONGO_URI is not set." >&2
  exit 1
fi
command -v mongodump >/dev/null 2>&1 || { echo "ERROR: mongodump not found (install MongoDB Database Tools)." >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
echo "[backup] dumping to ${OUT}"
mongodump --uri="${MONGO_URI}" --archive="${OUT}" --gzip

# Retention: keep the 14 most recent archives.
ls -1t "${BACKUP_DIR}"/mongo-*.archive.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "[backup] done: ${OUT}"
