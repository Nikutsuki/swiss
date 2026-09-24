#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env
if [[ -f "${MONITORING_COMPOSE_FILE}" ]]; then
  compose_monitoring down "$@" || true
fi
compose_app down "$@"
compose_proxy down "$@"

log_info "Stacks stopped."
