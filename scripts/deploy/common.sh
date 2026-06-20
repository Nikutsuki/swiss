#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.prod.yml"
PROXY_COMPOSE_FILE="${ROOT_DIR}/infra/nginx/docker-compose.proxy.yml"
ENV_FILE="${ROOT_DIR}/deploy/.env.prod"

ensure_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing ${ENV_FILE}. Copy deploy/.env.prod.example and fill it first."
    exit 1
  fi
}

load_env() {
  ensure_env_file
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
}

compose_app() {
  docker compose --env-file "${ENV_FILE}" -f "${APP_COMPOSE_FILE}" "$@"
}

compose_proxy() {
  docker compose --env-file "${ENV_FILE}" -f "${PROXY_COMPOSE_FILE}" "$@"
}
