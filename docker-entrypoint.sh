#!/bin/sh
set -euo pipefail

cd /app

if [ -f .env ]; then
  set -a
  . .env
  set +a
fi

pnpm run migrate:deploy

pnpm start:prod
