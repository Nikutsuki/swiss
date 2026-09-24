#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

load_env
cd "${ROOT_DIR}"


STATE_FILE="${ROOT_DIR}/.last_known_good"
PREV_COMMIT=""

if [[ -f "${STATE_FILE}" ]]; then
  PREV_COMMIT="$(cat "${STATE_FILE}")"
elif git rev-parse --verify HEAD >/dev/null 2>&1; then
  PREV_COMMIT="$(git rev-parse HEAD)"
fi

rollback_on_failure() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 ]]; then
    log_error "Deployment failed with exit code ${exit_code}"
    if [[ -n "${PREV_COMMIT}" ]]; then
      log_warn "Rolling back to ${PREV_COMMIT}..."
      "${SCRIPT_DIR}/rollback.sh" "${PREV_COMMIT}" || {
        log_error "Rollback failed"
      }
    else
      log_warn "No previous state recorded. Cannot rollback"
    fi
  fi
  exit "${exit_code}"
}

trap rollback_on_failure EXIT

log_info "Fetching latest code..."
git fetch origin main
git reset --hard origin/main

log_info "Running preflight checks..."
"${SCRIPT_DIR}/preflight.sh"

log_info "Verifying Nginx configuration..."
"${SCRIPT_DIR}/verify-nginx.sh"

log_info "Building production images..."
"${SCRIPT_DIR}/build.sh"

log_info "Starting services..."
"${SCRIPT_DIR}/up.sh"

log_info "Applying database migrations..."
"${SCRIPT_DIR}/migrate.sh"

log_info "Verifying health..."
"${SCRIPT_DIR}/healthcheck.sh"

CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
echo "${CURRENT_COMMIT}" > "${STATE_FILE}"

trap - EXIT
log_info "Deployment complete. Current commit: ${CURRENT_COMMIT}"