BEGIN;
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
COMMIT;
