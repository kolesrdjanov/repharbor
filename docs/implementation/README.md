# V1 implementation plan

Start with [the product specification](../RepHarbor-V1.md). This queue turns the product requirements into independently assignable work. Each ID below has an implementation brief and a local acceptance example. The rows describe planned work. A phase number gives the usual order; the dependency column determines when a task is ready.

## Work queue

| Phase | IDs and owner | Depends on | Result |
|---|---|---|---|
| 0 · Foundation | T0 tooling, C0 contracts | T0 first for repo scaffolding | A local API, worker, database, and private app with shared contracts and an agreed reference example |
| 1 · Identity and app shell | A1 backend, U1 frontend | T0, identity contract from C0 | Real email magic-link login, contextual navigation, and sessions |
| 2 · Engagements | B2 backend, U2 frontend | C0 and A1 for backend, U1 and engagement contract for frontend | Founder and rep accept versioned product terms and resolve claims |
| 3 · Sales ingestion | I3 backend/integrations, P1–P4 provider adapters | C0, T0 for I3; I3 contract for each adapter | Verified events become attributed or reviewable transactions |
| 4 · Commission statement | L4 backend, U4 frontend | C0 rules and B2, I3 contract for L4; U2 and statement contract for U4 | Same itemized balance and manual external payment history for both roles |
| 5 · Integration management | F5 matching API, U5 frontend, R5 reconciliation | B2, I3; provider contracts for UI; one working adapter for first live slice | Founder connects sources, resolves gaps and sees real balances |
| 6 · Pilot and release | O6 operations, S6 RepHarbor billing, E6 pilot | First complete slice for pilot rehearsal; all four adapters and F5/U5/R5 for V1 coverage | Deployable app, observable ingestion, reconciled pilot statement |
| 7 · Public website | W7 website | Phase 6 app and pilot release work complete | Nuxt website on Cloudflare with crawlable, accurate product pages |

- [Phases 0–2 · Foundation, identity, and engagements](foundation.md)
- [Phases 3–5 · Providers, statements, and reconciliation](commissions.md)
- [Phases 6–7 · Pilot, deployment, billing, and website](release.md)

**First end-to-end milestone.** Take one real pilot provider through I3, its adapter, F5, L4, U4, and U5. The founder and rep must both see €230 in the reference example. Build the other three adapters against the same interface. Stripe is a sensible development fixture if the pilot provider is still unknown. All four are in V1.

## Picking up and handing off work

1. Take a ready task ID. Check the current branch and the existing implementation before adding files. The suggested paths below establish ownership in a new repo. Use the equivalent existing module if earlier work already created it.
2. Before backend and frontend split, land the shared Zod input/output schemas, example response, and role restrictions for the affected operations. Frontend can then use fixture responses locally. Connect real endpoints before declaring a user workflow complete.
3. Assign one owner per shared contract change or Prisma migration. Provider owners can work independently under their provider directory. Route requests for a new normalized field to the I3 owner. Integrate migrations in order and preserve previously ingested data.
4. In the handoff, record the ID, affected paths, migration or environment changes, the exact scenario exercised locally and its observed result, any remaining external dependency, and the next ready IDs. Distinguish fixture coverage from provider sandbox or production evidence.
5. Keep verification proportional. Run the target app or example used by the slice. Add a narrow regression case for logic such as duplicate commissions or single-use login. Defer global automation, lint, and push gates. Production provisioning and use of live customer accounts are separate operational actions.

**Example assignment.** “Implement A1 from foundation.md. Use the identity contract from C0. Demonstrate that opening the email does not consume the link, a confirmed link grants one session, and replay fails. Hand U1 the response shapes, local email setup, and observed results.”

## Decisions and working defaults

| Topic | Build against | Decision needed before real use |
|---|---|---|
| Layout | pnpm workspace; apps/api, apps/app, packages/contracts; reserve apps/site for W7. API and worker share one image. Konvuno has comparable workspace, Prisma, and Railway service layouts. | Reuse compatible patterns. Keep credentials and startup-specific code in their original projects. |
| Commission | The spec's proposed collected-payment basis. Pilot fixture has 20%, 12 months, monthly statements, due on the 10th of the following month. Calculate using the company's selected time zone. | Founder and rep accept explicit terms. Confirm fee basis, rounding, amendment treatment, and initial historical coverage before using real balances. A direct MRR/ARR model remains an open product decision. |
| Amendments and history | For the fixture, a new version applies to collections on or after its effective date once accepted. Refunds follow the original sale. Set the fixture's opening balance to zero at a known coverage date. | Record the actual policy in the agreement. For incomplete historical data, show the coverage date and keep the opening balance unresolved until explicitly agreed. |
| External access | Develop with synthetic records, test-mode accounts, and local mail capture. Keep each external dependency attached to its task. | Resend sender verification, provider test credentials or fixtures, a pilot product, and deployment access are needed at their respective milestones. Continue independent tasks while access is pending. |
