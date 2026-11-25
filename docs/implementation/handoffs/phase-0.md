# Phase 0 · Foundation

## T0 · Local workspace and runtime

The T0 implementation is in the commit that introduced this section on top of `6604d2a`.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Install and run from the workspace | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `README.md` | Node 24 and pnpm 11.25.0 installed from the committed lockfile. Both app and API built. |
| Start PostgreSQL and apply migrations | `compose.yaml`, `apps/api/prisma/migrations`, `apps/api/prisma/seed.ts` | PostgreSQL reported healthy. Prisma recorded the identity migration. The development seed created two accounts. |
| Start the API and worker separately | `apps/api/src/main.ts`, `apps/api/src/worker.ts` | Both process endpoints returned HTTP 200 with `{"status":"ok"}`. The worker readiness route uses its own loopback port. |
| Reach the private app | `apps/app/src/Workspace.vue` | Chromium displayed the workspace at 375 CSS pixels and reported a successful API connection. |
| Capture local email | `compose.yaml`, `apps/api/.env.example` | A synthetic email sent over SMTP appeared in the Mailpit inbox. |
| Preserve the implementation sequence | Workspace file list | Public Nuxt site, automated suites and push checks are due in later slices. |

Prisma engine download recovered after adding `binaries.prisma.sh` to the cloud environment’s allowed network access. The CLI verified and used the official engine. The exact local start and stop commands are in the root README.

## C0 · Contracts and reference statement

The phase audit covers T0 commit `d407df0` and the C0 commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Share identity, amount, pagination and error contracts | `packages/contracts/src/index.ts`, `packages/contracts/src/wire.ts` | Generated wire types from OpenAPI, decoded the founder and rep examples in Node, and built both consumers. Chromium loaded the app using the same shared package. |
| Serve the canonical contract and examples | `apps/api/src/api-docs.ts`, `docs/technical/reference-statement.md` | The downloaded YAML matched the source byte for byte. Chromium rendered 44 documented operations. An unknown path returned the shared 404 envelope with the request ID from its header. |
| Persist stable reference data | `apps/api/prisma/migrations/20261125001000_reference_engagement`, `apps/api/prisma/seed.ts` | PostgreSQL returned Konvuno Pro, Dimitrije, and the unsigned 2,000-basis-point proposal. Prisma reported no schema drift. |
| Preserve an independent expected result | `packages/contracts/src/reference.ts` | An independent sum of the synthetic inputs produced 40,000 accrued before refund, 15,000 recorded, 2,000 reversed and 23,000 outstanding. Actual statement verification belongs to L4/U4. |

The next ready task is A1. Use the generated identity operations and shared Zod schemas for request and response validation. Start with the login and session migration.
