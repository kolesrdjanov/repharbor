# Stack verification

## Backend and private app

The audit reviewed the complete local implementation across [identity](phase-1.md), [engagements](phase-2.md), [ingestion](phase-3.md), [statements](phase-4.md), [integrations](phase-5.md), and [private release](phase-6.md). Sandbox, deployed sign-in, and live pilot evidence remain in their respective handoffs.

| Stack | Local command | Observed result | Push workflow and triggers |
|---|---|---|---|
| Backend | `pnpm verify:backend` | Shared contracts and Prisma generated, ESLint and TypeScript passed, API built, and two PostgreSQL/Mailpit regression scenarios passed. They cover concurrent single-use login, isolation, invalid authentication, provider replay and out-of-order refund, external payment retries, balance equality, and separate subscription billing. | [Backend workflow](../../../.github/workflows/backend.yml) triggers on API, consumed contracts and OpenAPI, Compose, Docker/Railway, and workspace inputs. |
| Private app | `CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm verify:app` | Vue lint, types and build passed. One browser scenario passed across separately signed-in founder and rep sessions. It covers scanner safety, deep links, keyboard dialog focus, retry after a lost response, both EUR 230.00 balances, refund trace, and logout. | [Private app workflow](../../../.github/workflows/private-app.yml) triggers on the app, API code and fixtures consumed by its browser check, contracts, Compose, and workspace inputs. |

Local tests use isolated PostgreSQL schemas and local Mailpit. The audit caught a Prisma PostgreSQL adapter setting that selected the default schema despite a schema-specific URL. Generated and raw queries now share the configured schema. The browser check waits for dialog dismissal before verifying focus return. Local commits and pushes have no verification hooks. Push workflows are defined in the working branch. No remote run was observed.
