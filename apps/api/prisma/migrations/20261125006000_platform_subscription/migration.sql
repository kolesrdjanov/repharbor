BEGIN;
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
