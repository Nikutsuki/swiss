#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

required_bins=(docker)
for bin in "${required_bins[@]}"; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    echo "Missing required binary: ${bin}"
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is missing."
  exit 1
fi

load_env

required_env=(
  ROOT_DOMAIN POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL JWT_SECRET
  NEXT_PUBLIC_ROOT_DOMAIN COOKIE_SECURE
  NEXT_PUBLIC_AUTH_URL NEXT_PUBLIC_MONOLITH_URL NEXT_PUBLIC_MONOLITH_DROP_URL NEXT_PUBLIC_MONOLITH_STREAM_URL
  AUTH_API_ORIGIN MONOLITH_API_ORIGIN MONOLITH_DROP_API_ORIGIN MONOLITH_STREAM_API_ORIGIN
  NEXT_PUBLIC_SIGNALING_WS_URL NEXT_PUBLIC_MONOLITH_STREAM_WS_URL
  SIGNALING_ALLOWED_ORIGINS MONOLITH_DROP_CORS_ORIGINS MONOLITH_STREAM_CORS_ORIGINS
  SSL_CERTS_DIR
  PGADMIN_DEFAULT_EMAIL PGADMIN_DEFAULT_PASSWORD
)

for key in "${required_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var: ${key}"
    exit 1
  fi
done

if [[ ! -f "${SSL_CERTS_DIR}/origin-cert.pem" ]]; then
  echo "Missing certificate file: ${SSL_CERTS_DIR}/origin-cert.pem"
  exit 1
fi

if [[ ! -f "${SSL_CERTS_DIR}/origin-key.pem" ]]; then
  echo "Missing key file: ${SSL_CERTS_DIR}/origin-key.pem"
  exit 1
fi

for network in edge-proxy-network monitoring-network; do
  if ! docker network inspect "${network}" >/dev/null 2>&1; then
    echo "Creating missing docker network: ${network}"
    docker network create "${network}" >/dev/null
  fi
done

echo "Preflight OK."
