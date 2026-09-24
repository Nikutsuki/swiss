#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

load_env
cd "${ROOT_DIR}"


STATE_FILE="${ROOT_DIR}/.last_known_good"
TARGET_COMMIT="${1:-}"

if [[ -z "${TARGET_COMMIT}" ]]; then
  if [[ -f "${STATE_FILE}" ]]; then
    TARGET_COMMIT="$(cat "${STATE_FILE}")"
  else
    log_error "No target commit specified and ${STATE_FILE} not found"
    log_error "Usage: $0 [COMMIT_SHA]"
    exit 1
  fi
fi

CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
log_info "Rolling back from ${CURRENT_COMMIT} to ${TARGET_COMMIT}"

git checkout "${TARGET_COMMIT}"
"${SCRIPT_DIR}/build.sh"
compose_proxy up -d --remove-orphans
compose_app up -d --remove-orphans
"${SCRIPT_DIR}/healthcheck.sh"

log_info "Rollback to ${TARGET_COMMIT} complete"
