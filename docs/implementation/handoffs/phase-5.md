# Phase 5 · Integration management

This audit covers attribution from `1f3cad0` and the Stripe integration UI and reconciliation in the commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Founder connects, maps and disconnects a source | `apps/app/src/features/integrations/SourceDialog.vue`, `SourceCard.vue`, `apps/api/src/integrations/connections.ts` | Chromium connected a signed synthetic Stripe source, saved its secondary mapping, and disconnected it. The returned account identifier was masked and the completed connection displayed no credential. |
| Resolve a different-email payer with statement evidence | `apps/api/src/integrations/attribution.ts`, `apps/app/src/features/integrations/Review.vue` | The founder confirmed the customer from an approved claim and followed the resulting commission entry link. The rep saw the entry through the separate statement session. Opening the review route as the rep displayed the access recovery text. |
| Preserve coverage gaps and checkpoint history work | `apps/api/src/integrations/reconciliation.ts`, `apps/app/src/features/integrations/SourceCard.vue` | A fixture with no Stripe read credential queued an import and returned a visible unavailable-history range without a successful reconciliation watermark. |
| Reconcile overlapping deliveries | `apps/api/src/integrations/inbox.ts`, `ingestion-worker.ts`, `reconciliation.ts` | Synthetic overlap reused normalized economic keys. Provider pagination interruption and recovery require sandbox read credentials and records spanning multiple pages. |

The initial UI and worker audit used local fixtures. The first Stripe fixture spans connection, matching, collection, correction and both statements. See the [provider audit](phase-3.md#p2p4-adapter-audit) for Dodo Payments, Whop, and RevenueCat.

## R5 recovery follow-up

The local acceptance test runs the Stripe SDK against a loopback server and the worker against PostgreSQL. It compares an uninterrupted import with a worker killed after the first page. The recovered worker resumes at the saved cursor and accepts overlapping signed webhook deliveries. Both paths post the same entries and produce EUR 270.00 outstanding after an added EUR 200.00 renewal on top of the EUR 230.00 reference statement.

The same test verifies two remaining portions of a partially repaired gap, a second import that closes those portions, a connection-scoped replay with a reason in the audit log, and scheduled reconciliation after the initial import. Both participant sessions see the same coverage warning without changing the computed balance. Follow the [recovery runbook](../runbook.md#observe-and-recover) for monitoring and replay. Real Stripe, Dodo Payments, and Whop API history and pagination still need provider test accounts. RevenueCat history remains unavailable through the current adapter.
