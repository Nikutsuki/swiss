#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../deploy/common.sh"

load_env

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/postgres}"
BACKUP_FILE=""
AUTO_CONFIRM=0

for arg in "$@"; do
  if [[ "${arg}" == "--yes" || "${arg}" == "-y" ]]; then
    AUTO_CONFIRM=1
  elif [[ -z "${BACKUP_FILE}" ]]; then
    BACKUP_FILE="${arg}"
  fi
done

if [[ -z "${BACKUP_FILE}" ]]; then
  BACKUP_FILE="$(find "${BACKUP_DIR}" -name "postgres_${POSTGRES_DB}_*.sql.gz" -type f 2>/dev/null | sort -r | head -n1)"
  if [[ -z "${BACKUP_FILE}" ]]; then
    log_error "No backup files found in ${BACKUP_DIR}."
    exit 1
  fi
  log_info "No backup file specified. Selecting latest backup: ${BACKUP_FILE}"
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  log_error "Backup file does not exist: ${BACKUP_FILE}"
  exit 1
fi

if ! gzip -t "${BACKUP_FILE}"; then
  log_error "Backup file integrity check failed: ${BACKUP_FILE}"
  exit 1
fi

if [[ ${AUTO_CONFIRM} -ne 1 ]]; then
  read -r -p "WARNING: Restoring will overwrite database '${POSTGRES_DB}'. Continue? [y/N] " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    log_info "Restore cancelled by user."
    exit 0
  fi
fi

log_info "Restoring database '${POSTGRES_DB}' from ${BACKUP_FILE}..."

if compose_app ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^postgres$'; then
  gunzip -c "${BACKUP_FILE}" | compose_app exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'postgres'; then
  CONTAINER_NAME="$(docker ps --filter "name=postgres" --format '{{.Names}}' | head -n1)"
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null
else
  log_error "PostgreSQL container is not running."
  exit 1
fi

log_info "Database restore completed successfully."
