#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env
compose_proxy exec -T nginx nginx -t
echo "Nginx config is valid."
