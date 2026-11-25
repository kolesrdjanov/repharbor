# RepHarbor operations

## Start and release

Build the root Dockerfile once. The image runs the Nest HTTP API with `node dist/main.js` or the worker with `node dist/worker.js` from `apps/api`. Railway has separate service definitions under [deploy](../../deploy). Configure the service root as the repository root and add PostgreSQL. Apply the API migration pre-deploy once using the migration-role database credential. Start or promote the worker after the migrations succeed, using the same image revision. Set the API port to its platform `PORT` and the worker service port to its configured `WORKER_HEALTH_PORT`. Both services expose `/health`.

The runtime roles need application table access and must not own the schema. Run migrations with a separate credential. Supply the validated environment settings shown in `apps/api/.env.example` from the platform's secret store. Set the production app and API origins to `https://app.repharbor.io` and `https://api.repharbor.io`. Use the same encryption key on API and worker in a given environment. Set `SALES_ENVIRONMENT=live` and disable synthetic fixture connections in production. Keep the Resend sender and API key, revenue credentials, and platform Stripe billing credentials scoped to that environment.

Build the private app with `VITE_API_ORIGIN=https://api.repharbor.io pnpm --filter @repharbor/app build`. Its Wrangler configuration serves the static assets with SPA routing on the private hostname. From `apps/app`, use Wrangler to review and deploy the configured environment after approval. Exercise a protected deep link and the full Resend email flow on the deployed host before a pilot.

Production provisioning, deploys, real customer connections, and live subscription checkout require separate approval. The test billing configuration uses a test Stripe price and a webhook registered on `/v1/billing/webhooks/stripe`. Use a separate Stripe account from company sales data. Keep `BILLING_ALLOW_LIVE_CHECKOUT=false` until the price and commercial policy are approved.

## Observe and recover

From the API directory or deployed image, run `node dist/operations.js status`. It reports database availability, job totals and oldest ready age by queue, and unresolved coverage gaps. Correlate HTTP failures using the response request ID and production logs. Use the source status, last delivery, reconciliation time, failed job ID, and scoped queue state to diagnose a gap. Watch for failed or aging sales jobs and unexplained gaps before closing a statement.

Run `node dist/operations.js check-sales 900` from a monitoring job or manually. It prints the job groups that need attention and exits with status 1 for failed normalization, a failed import with an open gap, a ready job or expired lease at least 900 seconds overdue, or an unavailable database. Use the pilot's agreed threshold and configure the notification recipient before the pilot.

For a new Stripe, Dodo Payments, or Whop connection, confirm the coverage start with both participants and queue the first import from **Integrations → Import history**. Start on the agreed opening date if earlier activity is already included in an opening balance. After a successful import, the worker reconciles that source every 24 hours by default. It resumes from the latest covered timestamp with up to one hour of overlap and uses the same deduplication as webhooks. Set `SALES_RECONCILIATION_INTERVAL_SECONDS=0` for manual-only imports. An account with unsupported history still shows a coverage gap. Importing a verified interval clears the covered portion of an existing gap.

After repairing a failed normalization job, use `node dist/operations.js replay <connection-id> <failed-job-id> "<reason>"`. To requeue matching failed deliveries in one connection, use `node dist/operations.js replay-range <connection-id> <start> <exclusive-end> "<reason>"` with ISO timestamps. The operation writes an audit event for each requeued job. A worker resumes a checkpointed import when its lease expires. After a terminal import failure, queue the affected date range again once the provider is available. Review the remaining gaps and compare the resulting statement with source data.

Use encrypted database snapshots with restricted access. Before a release that changes storage, take a backup and record the running commit, migration name, and image tag. Retention and alert thresholds depend on the pilot's agreed recovery objectives. The local restore rehearsal uses an isolated database in the Compose PostgreSQL service.

```sh
docker compose exec -T postgres pg_dump -U repharbor -d repharbor --format=custom > /tmp/repharbor-fixture.pgdump
docker compose exec -T postgres createdb -U repharbor repharbor_restore
docker compose exec -T postgres pg_restore -U repharbor -d repharbor_restore --exit-on-error < /tmp/repharbor-fixture.pgdump
```

Point a separate test process at the restored database and replay a retained signed event. Verify that the reference engagement stays at EUR 230.00. When a rollout fails, pause the worker and restore the last API, worker and static app versions that support the current schema. Fix forward after an incompatible migration or arrange an authorized recovery from the backup. Never write a restore over an active pilot database.

## Public website release

From the repository root, run `pnpm contracts:build` and `pnpm --filter @repharbor/site build`. The prerendered output includes public HTML, a sitemap, and robots policy. Build with the production origins or set `NUXT_PUBLIC_SITE_ORIGIN` and `NUXT_PUBLIC_APP_ORIGIN` for a test environment. Review the static output and `apps/site/wrangler.toml` before approving the separate public hostname release. After promotion, check the canonical URL, all provider pages, and the handoff to live sign-in.
