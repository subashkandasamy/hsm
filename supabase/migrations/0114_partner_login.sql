-- Migration 0114: external-partner magic-link login tokens.
-- External partners aren't tenants/Supabase users — they sign in to a separate
-- partner portal via a one-time email link. Tokens are single-use + expiring.

CREATE TABLE IF NOT EXISTS partner_login_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_login_tokens_partner ON partner_login_tokens (partner_id, created_at DESC);

-- Accessed only via server actions / route handlers using the service role.
ALTER TABLE partner_login_tokens ENABLE ROW LEVEL SECURITY;
