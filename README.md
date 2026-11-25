# RepHarbor

RepHarbor gives founders and independent sales reps a shared commission statement. Read the [V1 specification](docs/RepHarbor-V1.md) and [implementation queue](docs/implementation/README.md) for current scope.

## Local development

Install Node.js 24, Corepack, Docker with Compose, and Git. Run these commands from the repository root.

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
cp -n apps/api/.env.example apps/api/.env
cp -n apps/app/.env.example apps/app/.env
docker compose up -d --wait
pnpm contracts:build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Prisma downloads a verified engine from `binaries.prisma.sh`. In managed environments with a read-only home directory, set `XDG_DATA_HOME` to a writable directory for pnpm before running the commands.

Development serves the canonical OpenAPI document at `/docs/openapi.yaml` and a read-only viewer at `/docs`. Run `pnpm contracts:generate` after changing the document, then `pnpm contracts:build` to refresh the shared runtime package.

The seed is for local development and can be run again. For another migration, generate the client and apply migrations using the same two database commands.

Start the processes in separate terminals from the repository root.

```sh
pnpm dev:api
pnpm dev:worker
pnpm dev:app
```

Open the private app at http://localhost:5173. Request a link for `founder@konvuno.test` or `dimitrije@repharbor.test`, open it from the Mailpit inbox, and confirm explicitly. The worker delivers the email. The API and worker each check the migrated database and return `{"status":"ok"}` when available.

```sh
curl -fsS http://localhost:3000/health
curl -fsS http://127.0.0.1:3001/health
```

Mailpit accepts local mail on port 1025. Open the inbox at http://127.0.0.1:8025. The example server environment uses local SMTP and deployed environments use Resend with a verified sender. Only the public API origin belongs in the app environment. Generate a unique `SECRET_ENCRYPTION_KEY` for deployed mail jobs. Keep the API and worker on the same key.

Stop Node processes with Ctrl+C in their respective terminals. Stop the containers with `docker compose down`. The database volume persists across restarts.

## Public website

Run `pnpm contracts:build` and `pnpm dev:site` to start the Nuxt site on port 4173. Set `NUXT_PUBLIC_APP_ORIGIN=http://localhost:5173` to link to your local private app. The production defaults are `https://repharbor.io` and `https://app.repharbor.io`.

Run `pnpm --filter @repharbor/site build` to prerender the website to `apps/site/.output/public`. The site and private app have separate Cloudflare configurations. Deployment steps are in the [operations runbook](docs/implementation/runbook.md).

## Verification

Start PostgreSQL and Mailpit with `docker compose up -d --wait` for the backend and private app checks. Install Playwright Chromium with `pnpm --filter @repharbor/app exec playwright install chromium` or point `CHROMIUM_EXECUTABLE` at an existing Chromium binary. Run `pnpm verify` from the repository root to run lint, type checks, builds, and tests for all three stacks. Run `pnpm verify:backend`, `pnpm verify:app`, or `pnpm verify:site` for an individual stack. The site check starts its own static server and does not need PostgreSQL or Mailpit. Review the [handoffs](docs/implementation/handoffs) for scope and verification evidence.
