#!/bin/sh
set -euo pipefail

cd /app

pnpm run migrate:deploy

pnpm start:prod
