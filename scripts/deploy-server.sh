#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PM2_APP="${PM2_APP_NAME:-elektro-learn-backend}"

echo "==> ElektroLearn backend deploy: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js topilmadi."
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env yo'q. Serverda .env mavjud bo'lishi kerak (git'ga kirmaydi)."
  exit 1
fi

echo "==> npm ci + build"
npm ci
npm run build

echo "==> Migratsiya"
npm run db:migrate

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 topilmadi. Qo'lda: node dist/main"
  exit 1
fi

echo "==> PM2 restart $PM2_APP"
pm2 restart "$PM2_APP" --update-env
pm2 save

echo "Deploy yakunlandi."
