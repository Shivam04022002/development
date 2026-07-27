#!/usr/bin/env bash
# restart.sh — zero-downtime reload of both backends under PM2, then verify.
#
# Usage:  ./scripts/restart.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "[restart] reloading PM2 apps"
pm2 reload ecosystem.config.cjs --env production
pm2 save

sleep 3
./scripts/healthcheck.sh
echo "[restart] done."
