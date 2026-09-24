#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

"${SCRIPT_DIR}/preflight.sh"
compose_proxy up -d
compose_proxy exec -T nginx nginx -s reload >/dev/null 2>&1 || true
compose_app up -d
if [[ -f "${MONITORING_COMPOSE_FILE}" ]]; then
  compose_monitoring up -d
fi

log_info "Stacks started."
