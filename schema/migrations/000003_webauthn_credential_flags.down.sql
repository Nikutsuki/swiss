ALTER TABLE auth_credentials
    DROP COLUMN IF EXISTS credential_flags_initialized,
    DROP COLUMN IF EXISTS backup_state,
    DROP COLUMN IF EXISTS backup_eligible;
