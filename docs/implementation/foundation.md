# Phases 0–2 · Foundation, identity, and engagements

The [work queue](README.md) identifies upstream dependencies and the [specification](../RepHarbor-V1.md) defines product terms.

## T0 · Local workspace and runtime

**Owner:** tooling. **Outputs:** root workspace configuration, apps/api, apps/app, local Compose service, and development instructions.

1. Set up a pnpm workspace, lockfile, compatible Node version, and package-level development commands. Put the Nest HTTP process and background worker in the API package with separate entry points. Use Vue 3, Vite, TypeScript, Vue Router, Pinia, Tailwind, and shadcn-vue in the app.
2. Configure PostgreSQL locally with Docker Compose, Prisma migrations and a documented database initialization command. Provide placeholder environment examples for the database, API and app origins, session configuration, and mail delivery. Fail clearly on missing runtime configuration. Keep provider secrets server-side.
3. Document local start, stop, migrate, and seed commands alongside the implementation. Give each process a health or readiness signal. Provide a development-only mail capture mechanism so the full login flow can run locally.
4. Keep the site directory reserved until W7. Start with development and build scripts; keep push hooks and automated CI out of the scaffold.

**Acceptance:** From a fresh checkout with local environment values, a developer can start Postgres, apply migrations, reach the API health route and private app, and start the worker separately.

## C0 · Contracts and reference statement

**Owner:** backend/contracts. **Outputs:** packages/contracts, synthetic fixtures, and the initial persisted model.

- Define opaque identifiers, pagination, UTC timestamps, IANA time zones, explicit currencies, amounts in minor units and rate precision. Specify a lossless JSON representation for money. Use one typed error shape with a stable code, field errors where applicable, and a request ID.
- Publish contracts incrementally for session, company, engagement, terms, claim, provider connection, statement, entry detail, and manual payment. Show one success, empty state, and recoverable error for each workflow before its UI starts. Keep provider secrets and internal event payloads out of client schemas.
- Seed a founder, a rep, an unrelated company/rep, one product, and a proposed agreement. Give the reference case stable IDs. Use ten €200 sales, 20% commission, one €150 external payment, and one €100 refund. Keep an independent expected result of €230.

**Acceptance:** Backend and UI can consume the same identity and amount examples. Owners of later phases can extend the contracts without importing Prisma or provider SDKs into the browser.

## A1 · Passwordless identity and session API

**Owner:** backend. **Paths:** apps/api auth and mail modules, Prisma migration, identity contracts.

1. Implement email link request, link exchange, current session, and sign-out. Normalize the email consistently. Return the same response for a new and an existing address. Rate-limit requests and exchanges. Create the user on successful verification.
2. Generate a high-entropy, short-lived, single-use token. Store a digest and expiry. Proposed default lifetime is 15 minutes. A GET from a mail scanner can open the confirmation page safely. A user confirmation submits the exchange. Atomically consume the token and issue a session. Concurrent exchanges can yield only one successful session.
3. Deliver English emails through Resend. Distinguish login from invitation acceptance. Preserve a validated invitation reference through sign-in and bind acceptance to the invited email. Allowlist internal return destinations. Keep tokens out of logs and analytics. Show a resend action after expiry or mail delivery failure.
4. Use a server-revocable session and an HttpOnly cookie, Secure in deployed environments. Configure credentialed requests from the exact app origin, origin checks on mutations, intentional SameSite behavior, and expiry. Revoke the session on logout.

**Acceptance:** A new address and a returning address can sign in. Previewing an email link does not sign the user in. Confirming it once works; expired, reused, or competing exchanges receive a recoverable response. Sign-out ends access on the next protected request. Where a sender domain is unavailable, demonstrate locally and leave Resend delivery marked pending.

## U1 · Monochrome application shell and login

**Owner:** frontend. **Paths:** apps/app routes, layouts, stores, and shadcn-vue registry components.

- Use Chrome Modern Web Guidance first for the browser behavior being built. Apply UI UX Pro Max for interaction and accessibility. Use the neutral shadcn-vue theme, semantic grayscale tokens, visible focus, persistent form labels, and text for every status. Use the library's Button, Input, Label, Alert, Table, Sheet, Dialog, and related primitives as needed. Compose screens from these components and semantic page layout.
- Provide sign-in, check-your-email, link confirmation, expired-link recovery, and authenticated shell routes. Keep tokens out of persistent browser storage. Resume an invitation when present. A protected deep link returns to its intended route after sign-in.
- Show the current company or personal portfolio context in navigation. A user who plays both roles can switch context. A new user can create a company or enter their rep portfolio. Keep statement figures out of the shell until real data is available.

**Acceptance:** Exercise sign-in through the captured email and log out from the app. At narrow and desktop widths the form is usable by keyboard, submission status is announced, focus moves predictably, and reloading a protected route restores a valid session.

## B2 · Companies, agreements, and claims

**Owner:** backend. **Paths:** company, engagement, agreement, and claim modules plus their contracts and migrations.

1. Add company membership and products. Scope reads and mutations to the authenticated principal and its relationship to the requested resource. Product ownership belongs to the company. Rep portfolios aggregate the user's own engagements.
2. Implement both invitations. A founder invites a rep to a product with proposed terms. A rep invites a founder, who selects or creates the company and proposes terms. Use expiring, revocable invitations, an email match, repeat-safe acceptance, and a clear state when a link was already accepted.
3. Persist immutable agreement versions with basis, rate, accrual mode, eligibility period, refund treatment, statement cadence, due-date rule, time zone, effective date, and acceptance records. Reject stale-version acceptance and concurrent conflicting transitions. Closing an engagement stops new claims while preserving history and existing eligibility.
4. Let a rep register a prospect for one product. Founder approves or declines with a reason. Surface competing claims to the founder. Enforce one effective attribution for the same customer and product during a given period. Store who made each decision and when.

**Acceptance:** Two distinct users can propose and accept one version, register a claim, approve it, and close the engagement. An unrelated founder cannot retrieve the statement or claim by ID. A competing rep sees their own claim and decision only.

## U2 · Onboarding and engagement screens

**Owner:** frontend. **Depends on:** U1 and B2 interface contracts.

- Build company and product setup, a personal portfolio, both invitation flows, a terms review, amendment history, claim form, and founder review queue. Show who must act next and keep acceptance distinct from opening a link.
- On terms review show the actual formula, eligibility window, first-payment or recurring mode, and due date in plain English. On wrong-account, expired-invite, or stale-version responses, offer the specific recovery action. Use the same engagement route for both roles with server-authorized actions.
- Include loading, empty, pending, success, and error states. Return focus after dialogs. Name destructive or irreversible decisions clearly and preserve typed input on recoverable failure.

**Acceptance:** Through the UI, a founder and rep can complete B2 in either invitation direction. Each can later open the same agreed terms. A rep can see why a claim was declined without seeing another rep's customer list.
