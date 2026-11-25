-- RepHarbor V1 reference DDL. Apply to an empty PostgreSQL database.
-- The API owns production migrations. See database.md for the rollout order.
BEGIN;

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  created_at timestamptz NOT NULL DEFAULT now()
);
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
CREATE TABLE company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, time_zone text NOT NULL
);
CREATE TABLE company_founder (
  company_id uuid REFERENCES company, user_id uuid REFERENCES app_user,
  PRIMARY KEY (company_id, user_id)
);
CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES company,
  name text NOT NULL, UNIQUE (company_id,id)
);
CREATE TABLE engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
  product_id uuid NOT NULL, rep_id uuid REFERENCES app_user, closed_at timestamptz,
  FOREIGN KEY (company_id,product_id) REFERENCES product(company_id,id),
  UNIQUE (company_id,id), UNIQUE(company_id,product_id,id)
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
CREATE INDEX founder_by_user ON company_founder(user_id,company_id);
CREATE INDEX engagement_by_rep ON engagement(rep_id,id);
CREATE TABLE agreement_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagement,
  revision integer NOT NULL CHECK(revision > 0), rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
  accrual_mode text NOT NULL CHECK(accrual_mode IN ('first_payment','recurring')),
  basis text NOT NULL CHECK(basis = 'collected_ex_tax_before_fees'),
  eligibility_months integer NOT NULL CHECK(eligibility_months > 0),
  refund_policy text NOT NULL CHECK(refund_policy = 'reverse_original_rate'),
  cadence text NOT NULL CHECK(cadence = 'monthly'), due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 28),
  time_zone text NOT NULL, effective_at timestamptz NOT NULL, proposed_by uuid NOT NULL REFERENCES app_user,
  founder_accepted_at timestamptz NOT NULL, rep_accepted_at timestamptz, accepted_by_rep uuid REFERENCES app_user,
  UNIQUE(engagement_id,revision), UNIQUE(engagement_id,id)
);
CREATE TABLE claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, product_id uuid NOT NULL,
  engagement_id uuid NOT NULL, customer_label text NOT NULL, contact_email text,
  status text NOT NULL CHECK(status IN ('pending','approved','declined')), reason text,
  decided_by uuid REFERENCES app_user, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,product_id,engagement_id) REFERENCES engagement(company_id,product_id,id),
  UNIQUE(company_id,product_id,id), UNIQUE(engagement_id,id)
);
ALTER TABLE claim ADD COLUMN customer_key text GENERATED ALWAYS AS (
  CASE WHEN contact_email IS NOT NULL THEN 'email:' || lower(btrim(contact_email))
       ELSE 'label:' || lower(btrim(customer_label)) END
) STORED;
CREATE UNIQUE INDEX approved_claim_by_customer ON claim(company_id,product_id,customer_key)
  WHERE status = 'approved';
CREATE INDEX competing_claims_by_customer ON claim(company_id,product_id,customer_key)
  WHERE status IN ('pending','approved');
CREATE INDEX claims_by_status ON claim(engagement_id,status,created_at,id);
CREATE TABLE connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES company,
  provider text NOT NULL CHECK(provider IN ('stripe','dodo','whop','revenuecat')),
  environment text NOT NULL CHECK(environment IN ('test','live')), external_account text NOT NULL,
  secret_ref text NOT NULL, status text NOT NULL CHECK(status IN ('pending','active','degraded','disconnected')),
  coverage_from timestamptz, last_delivery_at timestamptz, reconciled_at timestamptz, import_cursor text,
  UNIQUE(provider,environment,external_account), UNIQUE(company_id,id)
);
CREATE TABLE product_mapping (
  company_id uuid NOT NULL, connection_id uuid NOT NULL, external_product text NOT NULL,
  channel text NOT NULL, product_id uuid NOT NULL,
  PRIMARY KEY(connection_id,external_product,channel),
  FOREIGN KEY(company_id,connection_id) REFERENCES connection(company_id,id),
  FOREIGN KEY(company_id,product_id) REFERENCES product(company_id,id)
);
CREATE TABLE source_authority (
  company_id uuid NOT NULL, product_id uuid NOT NULL, channel text NOT NULL,
  connection_id uuid NOT NULL, environment text NOT NULL CHECK(environment IN ('test','live')),
  PRIMARY KEY(product_id,channel,environment),
  FOREIGN KEY(company_id,product_id) REFERENCES product(company_id,id),
  FOREIGN KEY(company_id,connection_id) REFERENCES connection(company_id,id)
);
CREATE TABLE customer_link (
  company_id uuid NOT NULL, product_id uuid NOT NULL, connection_id uuid NOT NULL,
  external_customer text NOT NULL, claim_id uuid NOT NULL,
  PRIMARY KEY(connection_id,product_id,external_customer),
  FOREIGN KEY(company_id,connection_id) REFERENCES connection(company_id,id),
  FOREIGN KEY(company_id,product_id,claim_id) REFERENCES claim(company_id,product_id,id)
);
CREATE TABLE inbound_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES connection,
  external_event text NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,external_event)
);
CREATE TABLE job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, dedupe_key text NOT NULL UNIQUE,
  args jsonb NOT NULL, state text NOT NULL CHECK(state IN ('ready','leased','done','failed')),
  run_after timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  attempts integer NOT NULL DEFAULT 0, last_error_code text
);
CREATE INDEX job_runnable ON job(state,run_after) WHERE state IN ('ready','leased');
CREATE TABLE sale_effect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, connection_id uuid NOT NULL,
  transaction_key text NOT NULL, line_key text NOT NULL, effect_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('collection','refund','refund_reversal')),
  original_effect_id uuid REFERENCES sale_effect, original_external_key text,
  external_product text NOT NULL, external_customer text NOT NULL, channel text NOT NULL,
  occurred_at timestamptz NOT NULL, currency char(3) NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor >= 0),
  basis_minor bigint CHECK(basis_minor >= 0), source_event_id uuid REFERENCES inbound_event,
  disposition text NOT NULL CHECK(disposition IN ('pending','review','secondary','posted','ineligible')),
  FOREIGN KEY(company_id,connection_id) REFERENCES connection(company_id,id),
  UNIQUE(connection_id,transaction_key,line_key,effect_key), UNIQUE(company_id,id)
);
CREATE INDEX effects_by_original ON sale_effect(connection_id,original_external_key) WHERE original_external_key IS NOT NULL;
CREATE TABLE review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, effect_id uuid NOT NULL,
  reason text NOT NULL, resolution text, resolved_by uuid REFERENCES app_user, resolved_at timestamptz,
  FOREIGN KEY(company_id,effect_id) REFERENCES sale_effect(company_id,id)
);
CREATE UNIQUE INDEX review_open ON review_item(effect_id,reason) WHERE resolved_at IS NULL;
CREATE TABLE coverage_gap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES connection,
  starts_at timestamptz NOT NULL, ends_at timestamptz, reason text NOT NULL, resolved_at timestamptz,
  CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE opening_balance (
  environment text NOT NULL CHECK(environment IN ('test','live')),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagement,
  currency char(3) NOT NULL, amount_minor bigint NOT NULL, as_of date NOT NULL, note text NOT NULL,
  proposed_by uuid NOT NULL REFERENCES app_user, accepted_by uuid REFERENCES app_user, accepted_at timestamptz,
  UNIQUE(engagement_id,currency,environment), UNIQUE(engagement_id,id)
);
CREATE TABLE external_payment (
  environment text NOT NULL CHECK(environment IN ('test','live')),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagement,
  currency char(3) NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0), paid_on date NOT NULL,
  reference text, recorded_by uuid NOT NULL REFERENCES app_user, recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(engagement_id,id)
);
CREATE TABLE ledger_entry (
  environment text NOT NULL CHECK(environment IN ('test','live')),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, engagement_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('commission','refund','refund_reversal','external_payment','opening','reversal')),
  posting_key text NOT NULL UNIQUE, currency char(3) NOT NULL, delta_minor bigint NOT NULL,
  basis_minor bigint, rate_bps integer, agreement_id uuid, claim_id uuid,
  effect_id uuid, payment_id uuid, opening_id uuid, reverses_id uuid UNIQUE REFERENCES ledger_entry,
  effective_at timestamptz NOT NULL, posted_at timestamptz NOT NULL DEFAULT now(), due_on date,
  reason text, actor_id uuid REFERENCES app_user,
  FOREIGN KEY(company_id,engagement_id) REFERENCES engagement(company_id,id),
  FOREIGN KEY(engagement_id,agreement_id) REFERENCES agreement_version(engagement_id,id),
  FOREIGN KEY(engagement_id,claim_id) REFERENCES claim(engagement_id,id),
  FOREIGN KEY(company_id,effect_id) REFERENCES sale_effect(company_id,id),
  FOREIGN KEY(engagement_id,payment_id) REFERENCES external_payment(engagement_id,id),
  FOREIGN KEY(engagement_id,opening_id) REFERENCES opening_balance(engagement_id,id),
  CHECK(kind NOT IN ('commission','refund','refund_reversal') OR
    (effect_id IS NOT NULL AND agreement_id IS NOT NULL AND claim_id IS NOT NULL AND rate_bps IS NOT NULL AND basis_minor IS NOT NULL)),
  CHECK(kind <> 'external_payment' OR (payment_id IS NOT NULL AND delta_minor < 0)),
  CHECK(kind <> 'opening' OR opening_id IS NOT NULL),
  CHECK(kind <> 'reversal' OR (reverses_id IS NOT NULL AND reason IS NOT NULL))
);
CREATE INDEX ledger_statement ON ledger_entry(engagement_id,environment,currency,effective_at,id);
CREATE INDEX ledger_company ON ledger_entry(company_id,currency,effective_at);
CREATE FUNCTION deny_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append-only';
END;
$$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger_entry
FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
CREATE TABLE idempotency_record (
  actor_id uuid REFERENCES app_user, scope text, key text, request_hash bytea NOT NULL,
  response_code integer NOT NULL, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,scope,key)
);
CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES company,
  actor_id uuid REFERENCES app_user, subject_type text NOT NULL, subject_id uuid NOT NULL,
  action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_account (
  company_id uuid REFERENCES company, environment text NOT NULL CHECK(environment IN ('test','live')),
  stripe_customer text NOT NULL UNIQUE,
  stripe_subscription text UNIQUE, current_period_end timestamptz, status text NOT NULL, updated_at timestamptz NOT NULL,
  last_event_created bigint NOT NULL DEFAULT 0, PRIMARY KEY(company_id,environment)
);
CREATE TABLE billing_event (
  external_event text NOT NULL, environment text NOT NULL CHECK(environment IN ('test','live')),
  received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL, PRIMARY KEY(environment,external_event)
);
COMMIT;
