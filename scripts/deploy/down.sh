#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env
compose_app down "$@"
compose_proxy down "$@"

echo "Stacks stopped."
