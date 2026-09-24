#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env
log_info "Showing proxy logs (Ctrl+C to stop)..."
compose_proxy logs -f --tail=200 "$@"
