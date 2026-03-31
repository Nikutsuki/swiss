#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env

echo "== App stack status =="
compose_app ps
echo "== Proxy stack status =="
compose_proxy ps

if command -v curl >/dev/null 2>&1; then
  endpoints=(
    "https://auth.${ROOT_DOMAIN}"
    "https://monolith.${ROOT_DOMAIN}"
    "https://drop.${ROOT_DOMAIN}"
    "https://stream.${ROOT_DOMAIN}"
    "https://signal.${ROOT_DOMAIN}/ws"
    "https://stream-api.${ROOT_DOMAIN}/v1/stream/ws/test"
  )
  for url in "${endpoints[@]}"; do
    code="$(curl -k -s -o /dev/null -w '%{http_code}' "${url}" || true)"
    echo "${url} -> ${code}"
  done
else
  echo "curl not installed, skipped HTTP checks."
fi
