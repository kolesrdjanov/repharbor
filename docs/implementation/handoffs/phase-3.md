# Phase 3 · Sales ingestion

This is an interim audit for I3 and the Stripe ingestion portion of P1 in the commit that introduced this section.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Keep connection credentials server-side and scope mapping | `apps/api/src/integrations/connections.ts`, `providers.ts` | Connected a test fixture and mapped one product. The HTTP response carried status and account ID without credentials. |
| Authenticate signed raw bytes and commit before acknowledgment | `apps/api/src/main.ts`, `apps/api/src/integrations/inbox.ts` | A signed payload returned 204. An invalid signature returned 401. Wrong account and environment each returned 403 without posting a financial effect. |
| Deduplicate the event and the financial change independently | `apps/api/prisma/migrations/20261125004000_sales_ingress`, `apps/api/src/integrations/ingestion-worker.ts` | Two concurrent deliveries of the same ID returned 204 and created one inbox record. A separate event ID for the same invoice created no extra collection. |
| Handle an out-of-order refund | `apps/api/src/integrations/effects.ts` | The refund waited in a pending state until the original sale arrived and was linked to it by the original PaymentIntent. |
| Distinguish invoice lines, unknown mapping, and out-of-band payment | `apps/api/src/integrations/providers/stripe.ts` | The multi-product fixture preserved two separate lines with known basis. The unmapped product was reviewable. The invoice manually paid outside Stripe produced no effect. |
| Apply migration and build | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations` | Prisma applied the migration and reported no schema drift. The API built and the separate worker consumed signed deliveries. |

Ledger posting and source assignment are still due in L4/F5. The local run modeled webhook/backfill overlap as a second event for the same financial identity. Provider-controlled history and sandbox credentials have yet to be exercised. P2–P4 remain open until the Stripe statement slice works.

Next step is L4/F5. Add customer links and append-only ledger storage, then post the linked collection and refund from the worker and founder review path.
