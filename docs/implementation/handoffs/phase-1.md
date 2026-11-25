# Phase 1 · Identity and app shell

This audit covers A1 and the U1 sign-in and shell implementation in the commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Request identical responses for new and returning users | `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts` | Chromium requested and received captured emails for a new address and the seeded rep. Both requests used the same accepted response. |
| Keep scanner navigation safe | `apps/app/src/router/index.ts`, `apps/app/src/features/auth/ConfirmSignIn.vue` | A separate browser context opened each link and reached confirmation without receiving a session. The token disappeared from the address bar. |
| Consume each link once | `apps/api/prisma/migrations/20261125002000_passwordless_identity`, `apps/api/src/auth/auth.service.ts` | Two concurrent requests returned 200 and 410. Replaying the links returned 410, as did a link with a synthetic expired timestamp. |
| Deliver email through the configured worker | `apps/api/src/auth/login-mail.ts`, `apps/api/.env.example` | Mailpit received login email. The completed queue record no longer held the sealed token. Live Resend delivery remains pending a verified sender and API key. |
| Restore a deep link and revoke access on logout | `apps/app/src/stores/session.ts`, `apps/app/src/router/index.ts` | Chromium restored the protected portfolio after sign-in and reload. Returning to it after sign-out required sign-in. |
| Use the sign-in screens by keyboard at narrow and desktop widths | `apps/app/src/features/auth/SignIn.vue`, `apps/app/src/App.vue` | At 375 and 1,440 CSS pixels, Tab reached the labeled email control, Enter submitted, focus moved to the next heading, and the keyboard activated confirmation. Submission has a polite status region. |
| Switch roles, create a company and resume an invitation | `apps/app/src/features/auth/SessionShell.vue`, `apps/api/src/auth/auth.service.ts` | The shell lists verified founder memberships and the portfolio. Company creation and the invitation preview/acceptance workflow require B2/U2. Verify them at that boundary. |

New local environment settings are `SECRET_ENCRYPTION_KEY` and optional `TRUST_PROXY_HOPS`. The migration adds the identity, invitation, rate-limit and job tables. Next task is B2. Start by adding claim and audit storage and use `AuthService.requireSession` before every engagement read or mutation.

The company creation and invitation handoff checks were exercised during B2/U2. See [phase 2](phase-2.md) for the authenticated browser observations. Resend live delivery remains pending.
