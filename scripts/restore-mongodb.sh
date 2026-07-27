#!/usr/bin/env bash
# restore-mongodb.sh — restore a MongoDB database from a gzip archive created by
# backup-mongodb.sh.
#
# Usage:
#   MONGO_URI="mongodb+srv://..." ./scripts/restore-mongodb.sh <ARCHIVE.gz> [--drop]
#
# Pass --drop to drop existing collections before restoring (DESTRUCTIVE).
# Requires: mongorestore (MongoDB Database Tools).
set -euo pipefail

MONGO_URI="${MONGO_URI:-}"
ARCHIVE="${1:-}"
DROP_FLAG=""
[ "${2:-}" = "--drop" ] && DROP_FLAG="--drop"

if [ -z "${MONGO_URI}" ]; then
  echo "ERROR: MONGO_URI is not set." >&2
  exit 1
fi
if [ -z "${ARCHIVE}" ] || [ ! -f "${ARCHIVE}" ]; then
  echo "ERROR: archive file not found. Usage: restore-mongodb.sh <ARCHIVE.gz> [--drop]" >&2
  exit 1
fi
command -v mongorestore >/dev/null 2>&1 || { echo "ERROR: mongorestore not found (install MongoDB Database Tools)." >&2; exit 1; }

if [ -n "${DROP_FLAG}" ]; then
  echo "[restore] WARNING: --drop will delete existing collections. Ctrl-C within 5s to abort."
  sleep 5
fi

echo "[restore] restoring from ${ARCHIVE}"
mongorestore --uri="${MONGO_URI}" --archive="${ARCHIVE}" --gzip ${DROP_FLAG}
echo "[restore] done."
