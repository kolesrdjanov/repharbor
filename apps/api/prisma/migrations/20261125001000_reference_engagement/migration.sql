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
