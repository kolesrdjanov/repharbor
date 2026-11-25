BEGIN;
CREATE TABLE customer_link (
  company_id uuid NOT NULL, product_id uuid NOT NULL, connection_id uuid NOT NULL,
  external_customer text NOT NULL, claim_id uuid NOT NULL,
  PRIMARY KEY(connection_id,product_id,external_customer),
  FOREIGN KEY(company_id,connection_id) REFERENCES connection(company_id,id),
  FOREIGN KEY(company_id,product_id,claim_id) REFERENCES claim(company_id,product_id,id)
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
COMMIT;
