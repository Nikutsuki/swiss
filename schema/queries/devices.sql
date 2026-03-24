-- name: RegisterDevice :one
INSERT INTO auth_public_key (user_id, public_key) 
VALUES ($1, $2) 
RETURNING id;

-- name: FetchPublicKeysByUserID :many
SELECT id AS device_key_id, public_key 
FROM auth_public_key 
WHERE user_id = $1;

-- name: RevokeDevice :exec
DELETE FROM auth_public_key 
WHERE id = $1 AND user_id = $2;

-- name: DeviceKeyOwnedByUser :one
SELECT EXISTS(
  SELECT 1 FROM auth_public_key WHERE id = $1 AND user_id = $2
) AS ok;
