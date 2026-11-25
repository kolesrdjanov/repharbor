BEGIN;
ALTER TABLE connection ADD COLUMN reconciled_through timestamptz,
  ADD COLUMN next_reconciliation_at timestamptz;

UPDATE connection c SET reconciled_through = history.latest_end
FROM (
  SELECT (args->>'connectionId')::uuid AS connection_id, max((args->>'end')::timestamptz) AS latest_end
  FROM job
  WHERE kind = 'provider_backfill' AND state = 'done'
    AND COALESCE((args->>'unavailableBefore')::timestamptz, (args->>'start')::timestamptz) < (args->>'end')::timestamptz
  GROUP BY (args->>'connectionId')::uuid
) history
WHERE c.id = history.connection_id;
COMMIT;
