BEGIN;
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
CREATE TABLE inbound_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES connection,
  external_event text NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,external_event)
);
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
CREATE INDEX effects_by_original ON sale_effect(connection_id,original_external_key) WHERE original_external_key IS NOT NULL;
COMMIT;
