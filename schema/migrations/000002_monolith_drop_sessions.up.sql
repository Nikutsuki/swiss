CREATE TABLE monolith_drop_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    guest_user_id UUID NULL REFERENCES auth_users(id) ON DELETE SET NULL,
    peer_host TEXT NOT NULL UNIQUE,
    peer_guest TEXT NULL UNIQUE,
    join_secret TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monolith_drop_session_expires_at ON monolith_drop_session (expires_at);
