# Phase 5 · Integration management

This audit covers attribution from `1f3cad0` and the Stripe integration UI and reconciliation in the commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Founder connects, maps and disconnects a source | `apps/app/src/features/integrations/SourceDialog.vue`, `SourceCard.vue`, `apps/api/src/integrations/connections.ts` | Chromium connected a signed synthetic Stripe source, saved its secondary mapping, and disconnected it. The returned account identifier was masked and the completed connection displayed no credential. |
| Resolve a different-email payer with statement evidence | `apps/api/src/integrations/attribution.ts`, `apps/app/src/features/integrations/Review.vue` | The founder confirmed the customer from an approved claim and followed the resulting commission entry link. The rep saw the entry through the separate statement session. Opening the review route as the rep displayed the access recovery text. |
| Preserve coverage gaps and checkpoint history work | `apps/api/src/integrations/reconciliation.ts`, `apps/app/src/features/integrations/SourceCard.vue` | A fixture with no Stripe read credential queued an import and returned a visible unavailable-history range without a successful reconciliation watermark. |
| Reconcile overlapping deliveries | `apps/api/src/integrations/inbox.ts`, `ingestion-worker.ts`, `reconciliation.ts` | Synthetic overlap reused normalized economic keys. Provider pagination interruption and recovery require sandbox read credentials and records spanning multiple pages. |

The UI and worker use local fixture evidence. Provider-backed resume and operational replay remain open. The first Stripe fixture now spans connection, matching, collection, correction and both statements. The next ready work is P2, P3 and P4, starting with the Dodo adapter against the published payment and refund payloads.
