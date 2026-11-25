# Phase 2 · Engagements

The phase audit covers B2 and U2 in the commit that introduced this file, with the identity runtime from `5227c20`.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Create company, founder membership and product | `apps/api/src/engagement/engagement.service.ts`, `apps/app/src/features/engagements/CompanySetup.vue`, `Company.vue` | A new founder created a company and product in Chromium. An unrelated session received 404 from the dashboard and claim endpoints. |
| Founder invites a rep with terms | `apps/api/src/engagement/invitation.service.ts`, `apps/api/src/auth/login-mail.ts`, `apps/app/src/features/auth/InviteLanding.vue` | A captured invitation survived email confirmation. A 390px rep session reviewed the formula and joined, then accepted the terms separately. Retrying the original invitation creation and acceptance returned their existing results. Reusing the key for different terms returned 409. |
| Rep invites a founder | `apps/app/src/features/engagements/InviteForm.vue`, `InviteLanding.vue`, `apps/api/src/engagement/invitation.service.ts` | A newly signed-in founder created a company and product before returning to the pending invitation. A separate rep returned to the portfolio and accepted the proposed terms. A different signed-in account received `WRONG_ACCOUNT`. |
| Preserve agreement versions and reject a stale acceptance | `apps/api/src/engagement/access.ts`, `engagement.service.ts`, `apps/app/src/features/engagements/Engagement.vue` | The older agreement returned `STALE_REVISION` after a new proposal. The current revision retained both acceptance timestamps. Both browsers showed the accepted revision. |
| Register, approve and decline claims | `apps/api/prisma/migrations/20261125003000_claim_and_audit`, `apps/app/src/features/engagements/Claims.vue` | The founder approved one claim and supplied a reason when declining another. After reload, the rep could see both decisions and the decline reason. |
| Review competing claims without exposing them across reps | `apps/api/src/engagement/engagement.service.ts`, `docs/technical/schema.sql` | One competing claim was visible on the founder response only. A second approval for the same product and normalized contact returned 409. The competing rep received 404 for the first rep's claim list. |
| Close an engagement while retaining history | `apps/api/src/engagement/engagement.service.ts`, `apps/app/src/features/engagements/Engagement.vue` | Closing returned the closed state and preserved the approved claim. A new claim on that engagement returned 409. |
| Confirm migrations and runtime | `apps/api/prisma/migrations`, `packages/contracts/src/wire.ts` | PostgreSQL applied the claim/audit migration, Prisma reported no schema drift, and the API and Vue development builds passed. |

The reverse browser invitation exposed a missing link back to the pending invitation after company setup. The shell now shows that link while the handoff is active. Repeating the browser scenario reached terms acceptance. Statement retrieval and balances are still due in L4/U4.

Next task is I3. Add the durable source inbox and normalized effect storage, then take Stripe (P1) through the statement and review flow before starting P2–P4.
