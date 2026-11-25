# Phase 4 · Commission statements

This audit covers the I3 inputs from `f21544c` and the L4/U4 and initial F5 work in the commit that introduced this file.

| Acceptance criterion | Implementation | Local observation |
|---|---|---|
| Resolve customer and accepted terms | `apps/api/src/integrations/attribution.ts`, `apps/api/src/ledger/commission.ts` | Founder assigned ten approved claims to signed synthetic Stripe collections using the provider customer IDs. The fixture payer email differed from the rep's claim. An unrelated founder received 404 for the statement and a rep received 404 for the review queue. |
| Post exact commissions and refunds | `apps/api/prisma/migrations/20261125005000_commission_ledger`, `apps/api/src/ledger/commission.ts` | Ten EUR 200.00 basis amounts at 2,000 basis points accrued EUR 400.00. An eligible EUR 100.00 refund posted EUR −20.00. Replaying the refund, including a different envelope ID, left one financial adjustment. |
| Record and correct external payments | `apps/api/src/ledger/payments.ts`, `apps/app/src/features/statements/PaymentDialog.vue` | EUR 150.00 recorded reduced the balance to EUR 250.00 before the refund. Reusing the same key returned the existing payment and kept the final balance at EUR 230.00. The rep got 403 on the payment write. Reversing a separate JPY payment created one linked entry and rejected a second correction. |
| Compute due, currency balances, and history cutoff | `apps/api/src/ledger/statements.ts`, `apps/api/src/ledger/calendar.ts` | Both sessions returned EUR 230.00 outstanding and due at the December 11 cutoff. Pagination preserved the same cutoff and totals. A full JPY refund after recorded payment showed a credit and zero due. USD stayed separate. A renewal inside the term accrued, and a later collection outside the term did not. |
| Acknowledge opening history | `apps/api/src/ledger/payments.ts`, `apps/app/src/features/statements/OpeningBalances.vue` | The EUR opening status was unknown before the rep confirmed the founder's zero opening proposal, then became known. JPY remained unknown in the edge scenario. |
| Trace the statement as each role | `apps/app/src/features/statements/Statement.vue`, `EntryDetail.vue` | Separate Chromium sessions at 1,420 and 390 CSS pixels both showed EUR 230.00. Both traced the payment, refund and original EUR 40.00 commission at 20%. The founder's payment dialog opened by keyboard and Escape returned focus to the invoking button. |
| Build and apply migrations | `apps/api/prisma/migrations`, `packages/contracts/src/wire.ts` | Prisma applied the ledger migration. The API and Vue builds passed. |

The Stripe statements used synthetic signed fixture deliveries and local Mailpit accounts. The ledger uses separate test/live rows and an append-only database trigger. Provider sandbox and live pilot evidence remain pending. Review corrections and provider history still need the full Phase 5 audit.

Next task is U5/R5. Wire founder integration and review screens to the current source APIs and add bounded provider history reconciliation.
