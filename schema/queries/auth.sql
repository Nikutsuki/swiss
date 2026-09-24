-- name: CreateUser :one
INSERT INTO auth_users (email) 
VALUES ($1) 
RETURNING id, email, created_at;

-- name: GetUserByEmail :one
SELECT id, email 
FROM auth_users 
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, created_at
FROM auth_users
WHERE id = $1
LIMIT 1;

-- name: CreateCredential :one
INSERT INTO auth_credentials (user_id, credential_id, public_key, sign_count, aaguid, backup_eligible, backup_state, credential_flags_initialized, credential_label)
VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
RETURNING id, user_id, credential_id, public_key, sign_count, aaguid, backup_eligible, backup_state, credential_flags_initialized, created_at, revoked_at, last_used_at, credential_label;

-- name: UpdateCredentialLabel :exec
UPDATE auth_credentials
SET credential_label = $3
WHERE id = $1
  AND user_id = $2;

-- name: GetCredentialsByUserID :many
SELECT id, user_id, credential_id, public_key, sign_count, aaguid, backup_eligible, backup_state, credential_flags_initialized, created_at, revoked_at, last_used_at, credential_label
FROM auth_credentials 
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: UpdateCredentialSignCount :exec
UPDATE auth_credentials 
SET sign_count = $1, last_used_at = NOW() 
WHERE credential_id = $2;

-- name: UpdateCredentialFlags :exec
UPDATE auth_credentials
SET backup_eligible = $1,
    backup_state = $2,
    credential_flags_initialized = TRUE
WHERE credential_id = $3;

-- name: GetActiveCredentialsByUserID :many
SELECT id, user_id, credential_id, public_key, sign_count, aaguid, backup_eligible, backup_state, credential_flags_initialized, created_at, revoked_at, last_used_at, credential_label
FROM auth_credentials
WHERE user_id = $1 
  AND revoked_at IS NULL;

-- name: GetCredentialByCredentialID :one
SELECT id, user_id, credential_id, public_key, sign_count, aaguid, backup_eligible, backup_state, credential_flags_initialized, created_at, revoked_at, last_used_at, credential_label
FROM auth_credentials
WHERE credential_id = $1
LIMIT 1;

-- name: TouchCredentialLastUsed :exec
UPDATE auth_credentials
SET last_used_at = NOW()
WHERE id = $1;

-- name: RevokeCredential :exec
UPDATE auth_credentials
SET revoked_at = NOW()
WHERE id = $1 
  AND user_id = $2; -- Ownership guard