-- Mirrors auth_db.password_reset: single-use, hashed-at-rest code with an expiry.
CREATE TABLE auth_db.email_verification (
    verification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth_db.users(user_id),
    code_hash varchar(255) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE auth_db.email_verification IS 'Single-use: used_at set on redemption';
COMMENT ON COLUMN auth_db.email_verification.code_hash IS 'SHA-256 hash of the emailed numeric code, never stored in plaintext';

CREATE INDEX email_verification_user_id_idx ON auth_db.email_verification (user_id);

ALTER TABLE auth_db.email_verification ENABLE ROW LEVEL SECURITY;
