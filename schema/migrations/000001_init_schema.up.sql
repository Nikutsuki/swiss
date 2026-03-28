CREATE TABLE auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    credential_id BYTEA UNIQUE NOT NULL,
    public_key BYTEA NOT NULL,
    sign_count BIGINT DEFAULT 0,
    aaguid BYTEA,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    credential_label VARCHAR(255)
);

CREATE TABLE auth_public_key (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    public_key BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE monolith_paste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    title BYTEA NOT NULL,
    content BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NULL,
    burned_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_encrypted BOOLEAN DEFAULT TRUE,
    vault_only BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE monolith_dek (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paste_id UUID NOT NULL REFERENCES monolith_paste(id) ON DELETE CASCADE,
    device_key_id UUID NOT NULL REFERENCES auth_public_key(id) ON DELETE CASCADE,
    wrapped_dek BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_password_based BOOLEAN DEFAULT FALSE,
    UNIQUE (paste_id, device_key_id)
);

CREATE TABLE monolith_paste_share (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paste_id UUID NOT NULL UNIQUE REFERENCES monolith_paste(id) ON DELETE CASCADE,
    public_token TEXT NOT NULL UNIQUE,
    visibility_mode VARCHAR(16) NOT NULL CHECK (visibility_mode IN ('public', 'password')),
    share_wrap_nonce BYTEA NULL,
    share_wrap_ciphertext BYTEA NULL,
    password_salt BYTEA NULL,
    password_memory_kib INTEGER NULL,
    password_iterations INTEGER NULL,
    password_parallelism INTEGER NULL,
    password_key_length INTEGER NULL,
    expires_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_by UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth_totp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
    secret_seed VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimize lookup speed for authentication ceremonies
CREATE INDEX idx_auth_credentials_credential_id ON auth_credentials(credential_id);
CREATE INDEX idx_monolith_paste_user_id ON monolith_paste(user_id);
CREATE INDEX idx_monolith_paste_share_token ON monolith_paste_share(public_token);
CREATE INDEX idx_monolith_paste_share_paste_id ON monolith_paste_share(paste_id);

CREATE INDEX idx_monolith_paste_user_expires
ON monolith_paste (user_id, expires_at)
WHERE expires_at IS NOT NULL;