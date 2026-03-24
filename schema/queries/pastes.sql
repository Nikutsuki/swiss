-- name: InsertEncryptedPayload :one
INSERT INTO monolith_paste (user_id, title, content, expires_at, is_encrypted)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: WipeExpiredPastePayloadsForUser :exec
UPDATE monolith_paste
SET title = '\x'::bytea, content = '\x'::bytea
WHERE user_id = $1
  AND expires_at IS NOT NULL
  AND expires_at <= NOW()
  AND (octet_length(title) > 0 OR octet_length(content) > 0);

-- name: InsertWrappedDEKs :exec
INSERT INTO monolith_dek (paste_id, device_key_id, wrapped_dek, is_password_based)
SELECT 
    $1 AS paste_id, 
    unnest(@device_key_ids::uuid[]) AS device_key_id, 
    unnest(@wrapped_deks::bytea[]) AS wrapped_dek,
    unnest(@is_password_baseds::boolean[]) AS is_password_based;

-- name: FetchPasteMetadataByDeviceID :many
SELECT 
    p.id AS paste_id, 
    p.title AS encrypted_title, 
    p.created_at,
    p.expires_at,
    p.is_encrypted,
    d.wrapped_dek,
    d.is_password_based
FROM monolith_paste p
LEFT JOIN monolith_dek d ON p.id = d.paste_id
  AND (
    sqlc.narg('device_key_id')::uuid IS NOT NULL
    AND d.device_key_id = sqlc.narg('device_key_id')::uuid
  )
WHERE p.user_id = $1
  AND (octet_length(p.title) > 0 OR octet_length(p.content) > 0)
ORDER BY p.created_at DESC;

-- name: FetchPasteContentByPasteID :one
SELECT 
    p.id, 
    p.title AS encrypted_title, 
    p.content AS encrypted_content, 
    p.expires_at,
    p.is_encrypted,
    d.wrapped_dek,
    d.is_password_based
FROM monolith_paste p
LEFT JOIN monolith_dek d ON p.id = d.paste_id
  AND (
    sqlc.narg('device_key_id')::uuid IS NOT NULL
    AND d.device_key_id = sqlc.narg('device_key_id')::uuid
  )
WHERE p.id = $1 
  AND p.user_id = $2;

-- name: FetchPasteDekCoverageActiveForUser :many
SELECT 
  p.id AS paste_id,
  p.created_at,
  p.expires_at,
  p.is_encrypted,
  false AS payload_wiped,
  COALESCE(string_agg(d.device_key_id::text, ',' ORDER BY d.device_key_id), '')::text AS device_key_ids_csv
FROM monolith_paste p
LEFT JOIN monolith_dek d ON d.paste_id = p.id
WHERE p.user_id = $1
  AND (octet_length(p.title) > 0 OR octet_length(p.content) > 0)
GROUP BY p.id
ORDER BY p.created_at DESC;

-- name: FetchPasteDekCoverageBurnedForUser :many
SELECT 
  p.id AS paste_id,
  p.created_at,
  p.expires_at,
  p.burned_at,
  p.is_encrypted,
  COALESCE(string_agg(d.device_key_id::text, ',' ORDER BY d.device_key_id), '')::text AS device_key_ids_csv
FROM monolith_paste p
LEFT JOIN monolith_dek d ON d.paste_id = p.id
WHERE p.user_id = $1
  AND octet_length(p.title) = 0
  AND octet_length(p.content) = 0
GROUP BY p.id
ORDER BY p.created_at DESC;

-- name: BurnPasteForUser :execrows
UPDATE monolith_paste
SET title = '\x'::bytea,
    content = '\x'::bytea,
    burned_at = NOW()
WHERE id = $1
  AND user_id = $2
  AND (octet_length(title) > 0 OR octet_length(content) > 0);

-- name: PasteHasCiphertext :one
SELECT (octet_length(title) > 0 OR octet_length(content) > 0) AS ok
FROM monolith_paste
WHERE id = $1 AND user_id = $2;

-- name: PasteOwnedByUser :one
SELECT EXISTS(
  SELECT 1 FROM monolith_paste WHERE id = $1 AND user_id = $2
) AS ok;

-- name: UpsertWrappedDEK :exec
INSERT INTO monolith_dek (paste_id, device_key_id, wrapped_dek)
VALUES ($1, $2, $3)
ON CONFLICT (paste_id, device_key_id)
DO UPDATE SET wrapped_dek = EXCLUDED.wrapped_dek;

-- name: UpsertPasteShare :exec
INSERT INTO monolith_paste_share (
  paste_id,
  public_token,
  visibility_mode,
  share_wrap_nonce,
  share_wrap_ciphertext,
  password_salt,
  password_memory_kib,
  password_iterations,
  password_parallelism,
  password_key_length,
  expires_at,
  revoked_at,
  created_by,
  updated_at
)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9,
  $10,
  $11,
  NULL,
  $12,
  NOW()
)
ON CONFLICT (paste_id)
DO UPDATE SET
  public_token = EXCLUDED.public_token,
  visibility_mode = EXCLUDED.visibility_mode,
  share_wrap_nonce = EXCLUDED.share_wrap_nonce,
  share_wrap_ciphertext = EXCLUDED.share_wrap_ciphertext,
  password_salt = EXCLUDED.password_salt,
  password_memory_kib = EXCLUDED.password_memory_kib,
  password_iterations = EXCLUDED.password_iterations,
  password_parallelism = EXCLUDED.password_parallelism,
  password_key_length = EXCLUDED.password_key_length,
  expires_at = EXCLUDED.expires_at,
  revoked_at = NULL,
  created_by = EXCLUDED.created_by,
  updated_at = NOW();

-- name: RevokePasteShareForOwner :execrows
UPDATE monolith_paste_share s
SET revoked_at = NOW(),
    updated_at = NOW()
FROM monolith_paste p
WHERE s.paste_id = p.id
  AND s.paste_id = $1
  AND p.user_id = $2
  AND s.revoked_at IS NULL;

-- name: GetPasteShareByToken :one
SELECT
  p.id AS paste_id,
  p.title AS encrypted_title,
  p.content AS encrypted_content,
  p.expires_at AS paste_expires_at,
  p.burned_at,
  s.public_token,
  s.visibility_mode,
  s.share_wrap_nonce,
  s.share_wrap_ciphertext,
  s.password_salt,
  s.password_memory_kib,
  s.password_iterations,
  s.password_parallelism,
  s.password_key_length,
  s.expires_at AS share_expires_at,
  s.revoked_at
FROM monolith_paste_share s
JOIN monolith_paste p ON p.id = s.paste_id
WHERE s.public_token = $1;

-- name: ListRecentSharedPastesByOwner :many
SELECT
  p.id AS paste_id,
  p.title AS encrypted_title,
  p.created_at,
  p.expires_at,
  s.public_token,
  s.visibility_mode
FROM monolith_paste_share s
JOIN monolith_paste p ON p.id = s.paste_id
WHERE p.user_id = $1
  AND s.revoked_at IS NULL
  AND (s.expires_at IS NULL OR s.expires_at > NOW())
  AND (octet_length(p.title) > 0 OR octet_length(p.content) > 0)
ORDER BY p.created_at DESC
LIMIT 20;
