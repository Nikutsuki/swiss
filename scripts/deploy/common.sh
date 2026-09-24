#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.prod.yml"
PROXY_COMPOSE_FILE="${ROOT_DIR}/infra/nginx/docker-compose.proxy.yml"
MONITORING_COMPOSE_FILE="${ROOT_DIR}/infra/monitoring/docker-compose.monitoring.yml"
ENV_FILE="${ROOT_DIR}/deploy/.env.prod"
if [[ ! -f "${ENV_FILE}" && -f "${ROOT_DIR}/.env" ]]; then
  ENV_FILE="${ROOT_DIR}/.env"
fi
export APP_VERSION="${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo "latest")}"


log_info()  { echo "[INFO]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }
log_warn()  { echo "[WARN]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*" >&2; }
log_error() { echo "[ERROR] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*" >&2; }

ensure_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    log_error "Missing ${ENV_FILE}. Copy deploy/.env.prod.example and fill it first."
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

compose_monitoring() {
  docker compose --env-file "${ENV_FILE}" -f "${MONITORING_COMPOSE_FILE}" "$@"
}
