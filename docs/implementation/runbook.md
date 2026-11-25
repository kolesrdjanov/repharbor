# RepHarbor operations

## Start and release

Build the root Dockerfile once. The image runs the Nest HTTP API with `node dist/main.js` or the worker with `node dist/worker.js` from `apps/api`. Railway has separate service definitions under [deploy](../../deploy). Configure the service root as the repository root and add PostgreSQL. Apply the API migration pre-deploy once using the migration-role database credential. Start or promote the worker after the migrations succeed, using the same image revision. Set the API port to its platform `PORT` and the worker service port to its configured `WORKER_HEALTH_PORT`. Both services expose `/health`.

The runtime roles need application table access and must not own the schema. Run migrations with a separate credential. Supply the validated environment settings shown in `apps/api/.env.example` from the platform's secret store. Set the production app and API origins to `https://app.repharbor.io` and `https://api.repharbor.io`. Use the same encryption key on API and worker in a given environment. Set `SALES_ENVIRONMENT=live` and disable synthetic fixture connections in production. Keep the Resend sender and API key, revenue credentials, and platform Stripe billing credentials scoped to that environment.

Build the private app with `VITE_API_ORIGIN=https://api.repharbor.io pnpm --filter @repharbor/app build`. Its Wrangler configuration serves the static assets with SPA routing on the private hostname. From `apps/app`, use Wrangler to review and deploy the configured environment after approval. Exercise a protected deep link and the full Resend email flow on the deployed host before a pilot.

Production provisioning, deploys, real customer connections, and live subscription checkout require separate approval. The test billing configuration uses a test Stripe price and a webhook registered on `/v1/billing/webhooks/stripe`. Use a separate Stripe account from company sales data. Keep `BILLING_ALLOW_LIVE_CHECKOUT=false` until the price and commercial policy are approved.

## Observe and recover

From the API directory or deployed image, run `node dist/operations.js status`. It reports database availability, job totals and oldest ready age by queue, and unresolved coverage gaps. Correlate HTTP failures using the response request ID and production logs. Use the source status, last delivery, reconciliation time, failed job ID, and scoped queue state to diagnose a gap. Watch for failed or aging sales jobs and unexplained gaps before closing a statement.

After repairing a failed normalization job, use `node dist/operations.js replay <connection-id> <failed-job-id> "<reason>"`. The operation checks the connection and job relationship and writes an audit event. A worker may resume a job after its lease expires. Review the resulting effect and check the statement balance after processing.

Use encrypted database snapshots with restricted access. Before a release that changes storage, take a backup and record the running commit, migration name, and image tag. Retention and alert thresholds depend on the pilot's agreed recovery objectives. The local restore rehearsal uses an isolated database in the Compose PostgreSQL service.

```sh
docker compose exec -T postgres pg_dump -U repharbor -d repharbor --format=custom > /tmp/repharbor-fixture.pgdump
docker compose exec -T postgres createdb -U repharbor repharbor_restore
docker compose exec -T postgres pg_restore -U repharbor -d repharbor_restore --exit-on-error < /tmp/repharbor-fixture.pgdump
```

Point a separate test process at the restored database and replay a retained signed event. Verify that the reference engagement stays at EUR 230.00. When a rollout fails, pause the worker and restore the last API, worker and static app versions that support the current schema. Fix forward after an incompatible migration or arrange an authorized recovery from the backup. Never write a restore over an active pilot database.
