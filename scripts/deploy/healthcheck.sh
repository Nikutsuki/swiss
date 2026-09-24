#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env

compose_app ps
compose_proxy ps
if [[ -f "${MONITORING_COMPOSE_FILE}" ]]; then
  compose_monitoring ps || true
fi

if command -v curl >/dev/null 2>&1; then
  endpoints=(
    "https://www.${ROOT_DOMAIN}"
    "https://auth.${ROOT_DOMAIN}"
    "https://monolith.${ROOT_DOMAIN}"
    "https://drop.${ROOT_DOMAIN}"
    "https://stream.${ROOT_DOMAIN}"
    "https://fiszki.${ROOT_DOMAIN}"
    "https://signal.${ROOT_DOMAIN}/ws"
    "https://stream-api.${ROOT_DOMAIN}/v1/stream/ws/test"
  )
  failed=0
  for url in "${endpoints[@]}"; do
    ok=0
    code="000"
    for attempt in $(seq 1 8); do
      code="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "${url}" || true)"
      if [[ "${code}" != "000" && ! "${code}" =~ ^5 ]]; then
        ok=1
        break
      fi
      sleep 3
    done

    if [[ ${ok} -eq 1 ]]; then
      log_info "${url} -> ${code} (healthy on attempt ${attempt}/8)"
    else
      log_error "${url} -> ${code} (failed after 8 attempts)"
      failed=1
    fi
  done

  if [[ ${failed} -ne 0 ]]; then
    log_error "Healthcheck failed. One or more endpoints returned 5xx or could not be reached."
    exit 1
  fi
else
  log_warn "curl not installed, skipped endpoint checks."
fi

