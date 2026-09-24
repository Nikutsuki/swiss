-- name: CreateDropSession :one
INSERT INTO monolith_drop_session (host_user_id, peer_host, join_secret, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetDropSessionForHost :one
SELECT *
FROM monolith_drop_session
WHERE id = $1
  AND host_user_id = $2
  AND expires_at > NOW();

-- name: GetDropSessionForParticipant :one
SELECT *
FROM monolith_drop_session
WHERE id = @session_id
  AND (host_user_id = @user_id OR guest_user_id = @user_id)
  AND expires_at > NOW();

-- name: GetDropSessionByJoinSecret :one
SELECT *
FROM monolith_drop_session
WHERE join_secret = $1
  AND expires_at > NOW();

-- name: GetDropSessionByJoinSecretRaw :one
SELECT *
FROM monolith_drop_session
WHERE join_secret = $1;

-- name: JoinDropSession :one
UPDATE monolith_drop_session
SET peer_guest = $2,
    guest_user_id = $3
WHERE join_secret = $1
  AND peer_guest IS NULL
  AND expires_at > NOW()
RETURNING *;

-- name: CloseDropSessionForHost :one
UPDATE monolith_drop_session
SET closed_at = NOW()
WHERE id = $1
  AND host_user_id = $2
  AND closed_at IS NULL
RETURNING *;
