BEGIN;
CREATE TABLE login_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL, token_digest bytea NOT NULL UNIQUE,
  return_path text, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user, token_digest bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES app_user,
  email text NOT NULL, direction text NOT NULL CHECK(direction IN ('invite_rep','invite_founder')),
  engagement_id uuid REFERENCES engagement, token_digest bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, accepted_at timestamptz,
  accepted_by uuid REFERENCES app_user,
  CHECK(direction <> 'invite_rep' OR engagement_id IS NOT NULL)
);
ALTER TABLE login_link ADD COLUMN invitation_id uuid REFERENCES invitation;
ALTER TABLE user_session ADD COLUMN pending_invitation_id uuid REFERENCES invitation;
CREATE TABLE job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, dedupe_key text NOT NULL UNIQUE,
  args jsonb NOT NULL, state text NOT NULL CHECK(state IN ('ready','leased','done','failed')),
  run_after timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  attempts integer NOT NULL DEFAULT 0, last_error_code text
);
CREATE INDEX job_runnable ON job(state,run_after) WHERE state IN ('ready','leased');
CREATE TABLE auth_rate_limit (
  key text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL
);
CREATE INDEX auth_rate_limit_by_expiry ON auth_rate_limit(expires_at);
CREATE INDEX login_link_by_expiry ON login_link(expires_at);
CREATE INDEX user_session_by_expiry ON user_session(expires_at);
COMMIT;
