-- OAuth provider accounts linked to users (Google / GitHub sign-in).
-- A user may have several providers; each provider identity maps to exactly one user.

CREATE TABLE oauth_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id text NOT NULL,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX oauth_accounts_user_idx ON oauth_accounts(user_id);
