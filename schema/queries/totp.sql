-- name: UpsertTOTPSecret :one
INSERT INTO auth_totp (user_id, secret_seed, is_active)
VALUES ($1, $2, FALSE)
ON CONFLICT (user_id) DO UPDATE SET
    secret_seed = EXCLUDED.secret_seed,
    is_active = FALSE,
    created_at = NOW()
RETURNING id, user_id, secret_seed, is_active, created_at;

-- name: GetTOTPByUserID :one
SELECT id, user_id, secret_seed, is_active, created_at
FROM auth_totp
WHERE user_id = $1
LIMIT 1;

-- name: GetTOTPByEmail :one
SELECT t.id, t.user_id, t.secret_seed, t.is_active, t.created_at
FROM auth_totp t
INNER JOIN auth_users u ON u.id = t.user_id
WHERE u.email = $1
LIMIT 1;

-- name: SetTOTPActive :exec
UPDATE auth_totp
SET is_active = TRUE
WHERE user_id = $1;
