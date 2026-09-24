#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../deploy/common.sh"

cmd="${1:-status}"
shift || true

case "${cmd}" in
  up)
    load_env
    log_info "Starting Swiss monitoring stack (Prometheus, Grafana, Exporters)..."
    compose_monitoring up -d "$@"
    log_info "Monitoring stack is up. Grafana available at https://metrics.<domain> (proxied via Nginx)."
    ;;
  down)
    load_env
    log_info "Stopping Swiss monitoring stack..."
    compose_monitoring down "$@"
    log_info "Monitoring stack stopped."
    ;;
  restart)
    load_env
    log_info "Restarting Swiss monitoring stack..."
    compose_monitoring down
    compose_monitoring up -d "$@"
    log_info "Monitoring stack restarted."
    ;;
  logs)
    load_env
    compose_monitoring logs -f "$@"
    ;;
  status|ps)
    load_env
    compose_monitoring ps "$@"
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|status} [extra compose args]"
    exit 1
    ;;
esac
