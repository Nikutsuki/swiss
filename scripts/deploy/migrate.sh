#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env

docker run --rm \
  --network swiss-internal \
  -v "${ROOT_DIR}/schema/migrations:/migrations:ro" \
  migrate/migrate:v4.18.3 \
  -path=/migrations \
  -database="${DATABASE_URL}" \
  up

echo "Migrations applied."
