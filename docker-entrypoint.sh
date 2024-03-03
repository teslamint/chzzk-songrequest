#!/bin/sh
set -euo pipefail

cd /app

pnpm prisma generate
pnpm prisma migrate deploy

pnpm start:prod
