# Vue application implementation

Build the private app in apps/app. Use Vue 3, TypeScript, Vue Router, Pinia, Zod, Tailwind, and monochrome shadcn-vue components. Centralize the HTTP transport under src/api and group feature screens under src/features. UI UX Pro Max guides interactions and accessibility. Use Chrome Modern Web Guidance at the start of browser/UI implementation. Build the public Nuxt site after the pilot.

## Routes, operations and roles

Operation names correspond to the [OpenAPI contract](openapi.yaml). Navigation guards improve UX. Server-side authorization determines access on every request.

| Route or view | Access | Reads and writes |
|---|---|---|
| /sign-in, /sign-in/check-email, /auth/confirm | Public | requestMagicLink, exchangeMagicLink. Submit the token on explicit confirmation, offer resend after expiry, restore only an allowlisted relative return path. |
| App shell and company selector | Signed in | getSession, createCompany, signOut. Switch between a selected company and /portfolio. The same account can occupy both roles. |
| /companies/:companyId | Founder | getCompanyDashboard, listProducts, createProduct. Show per-currency balances and due dates. Open the relevant engagement for customer claims. |
| /portfolio | Signed in | getRepPortfolio, inviteFounder. Include an empty state with the action to invite a company. |
| /invite and company invitation dialog | Invited account or founder/sender | inviteRep, previewInvitation, acceptInvitation, revokeInvitation. Resume the token handoff after authentication, select product/company for founder-directed invites, and handle wrong-account and expired states. |
| /engagements/:engagementId/terms | Participant | getEngagement, listAgreementVersions, proposeAgreement, acceptAgreement, closeEngagement. Show accepted revision, proposed revision and effective date separately. |
| /engagements/:engagementId/claims | Participant | listClaims, registerClaim, decideClaim. The rep registers, the founder decides, and a decline requires a reason. |
| /engagements/:engagementId/statement and /entries/:entryId under that route | Participant | getStatement, getStatementEntry, recordExternalPayment, reverseExternalPayment, listOpeningBalances, proposeOpeningBalance, acceptOpeningBalance. Render shared totals from server responses. Payment recording and reversal are founder actions. |
| /companies/:companyId/integrations | Founder | listConnections, connectProvider, reconnectProvider, disconnectProvider, listMappings, setMappings, getCoverage, requestBackfill. Collect setup secrets only while submitting the form. |
| /companies/:companyId/review | Founder | listReviewItems, resolveReviewItem. Show the uncertain match, evidence and expected outcome before confirmation. Refresh the affected statement after resolution. |
| /companies/:companyId/billing | Founder | getBilling, startCheckout, openBillingPortal. Use the environment-specific hosted session URL and refresh billing state after returning. |

## Frontend file ownership

| Path | Responsibility |
|---|---|
| apps/app/src/router | Lazy route modules, public/private route metadata, session bootstrap and permitted return routes |
| apps/app/src/api | Shared fetch transport, typed operation wrappers, Zod decoding, cookie handling, cursor and error propagation |
| apps/app/src/stores | Session and selected context. Reset private cached state when the identity or company changes |
| apps/app/src/features/auth and engagements | Email confirmation, invitations, proposed terms, revision acceptance and claims |
| apps/app/src/features/statements | Portfolio/company summaries, per-currency statement table, entry detail, manual payment form and correction flow |
| apps/app/src/features/integrations and billing | Company-only setup, mapping, review and reconciliation, plus the separate RepHarbor subscription screen |
| packages/ui | Shared shadcn-vue Luma primitives and theme from preset `a2vfJNQ`. Compose feature-specific displays in their owning feature directory |

## State ownership and data movement

- Keep identity and company membership in a session store. Treat the route as the source for the current company and engagement. Session bootstrap runs once on initial navigation. Clear scoped data and abort stale requests on logout, identity change, or context switch.
- Send browser credentials through one API client. Decode responses against shared contracts and map status/code to typed UI errors. On 401, preserve a safe return route for sign-in. On 403 show the available context switch; on 404 return the user to the appropriate list. A failed background refresh can preserve prior data with a stale timestamp.
- Keep response data keyed by operation, resource, filters and snapshot. Keep form state local to the route or dialog. After mutations refresh affected summaries and details. A payment POST with an uncertain outcome retains its intent key on retry. Use one pending state and a server-issued entry as confirmation.
- Keep selection/filter state in the query string where useful for deep linking. Use opaque cursors unchanged. Keep dates and amounts in their original wire types until display. Format using explicit currency, minor-unit metadata, time zone, and locale. Avoid passing integer-string balances through Number where precision can be lost.
- Use shadcn-vue Table, Dialog, Sheet, Form fields, Alert and Button as the building blocks. Amounts, statuses and coverage limitations must remain readable without color. Loading, empty, stale, error, and retry states should reflect actual server conditions. Keep focus predictable and return it to the invoking control after dialogs.
- An invitation can survive an email-link round trip without putting its secret in local storage or a query string. Use an opaque short-lived server handoff bound to the login link. Carry the invitation reference through verified sign-in, restore preview, and then ask the user to accept. Manual navigation to a fresh browser can also resume by reopening the original invitation after login.

## Slice completion

1. U1 exercises a real browser session from captured email to protected deep link to sign-out. A scanner opening a URL cannot consume it.
2. U2 uses two independent sessions to agree on terms, approve a claim and inspect it from both views. Show an actionable refresh prompt on stale revision.
3. U4 demonstrates the EUR 230.00 example, duplicate submission recovery, recorded payment provenance, separate currencies, credit balances and an incomplete-history warning.
4. U5 changes one connection, resolves a review item and verifies that a rep sees the resulting statement without access to the founder's provider account metadata.
5. W7 builds the public Nuxt website at repharbor.io last. Use public HTML, canonical URLs, a sitemap and documented sample amounts. The app at app.repharbor.io remains private. Check that a sample page and its integration links read correctly with JavaScript disabled.
