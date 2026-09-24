#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../deploy/common.sh"

load_env

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +'%Y%m%d_%H%M%SZ')"
BACKUP_FILE="${BACKUP_DIR}/postgres_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

log_info "Starting PostgreSQL backup for '${POSTGRES_DB}'..."

if compose_app ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^postgres$'; then
  compose_app exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'postgres'; then
  CONTAINER_NAME="$(docker ps --filter "name=postgres" --format '{{.Names}}' | head -n1)"
  docker exec -i "${CONTAINER_NAME}" pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"
else
  log_error "PostgreSQL container is not running."
  exit 1
fi

if [[ ! -s "${BACKUP_FILE}" ]]; then
  log_error "Backup file is empty or missing: ${BACKUP_FILE}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

if ! gzip -t "${BACKUP_FILE}"; then
  log_error "Backup file archive integrity check failed: ${BACKUP_FILE}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

FILE_SIZE="$(du -h "${BACKUP_FILE}" | awk '{print $1}')"
log_info "Backup created: ${BACKUP_FILE} (${FILE_SIZE})"

# Retention cleanup
log_info "Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "postgres_${POSTGRES_DB}_*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -delete
log_info "Backup process complete."
