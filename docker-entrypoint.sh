#!/bin/sh
set -euo pipefail

cd /app

pnpx prisma migrate deploy

pnpm start:prod
