#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy/common.sh
source "${SCRIPT_DIR}/common.sh"

load_env

if [[ $# -gt 0 ]]; then
  compose_app build "$@"
  exit 0
fi

log_info "Building Go backend services..."
compose_app build auth-api monolith-api monolith-drop-api monolith-stream-api signaling-api fiszki-api

next_apps=(
  auth-portal
  monolith
  monolith-drop
  monolith-stream
  fiszki
  personal-website
)

for app in "${next_apps[@]}"; do
  log_info "Building Next.js app: ${app}..."
  compose_app build "${app}"
done

log_info "All production images built successfully."
