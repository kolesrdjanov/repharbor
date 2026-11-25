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
