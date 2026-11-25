# V1 technical design

These are implementation targets for the [V1 work queue](../implementation/README.md). The product definitions and pilot example come from the [product specification](../RepHarbor-V1.md). Development serves the canonical API specification at `/docs`. The [phase handoffs](../implementation/handoffs) record what each slice demonstrated and the provider or release evidence still pending.

| Before working on | Read | Deliver from that contract |
|---|---|---|
| T0, C0, A1, B2 | [Backend](backend.md), [database](database.md), [SQL](schema.sql), [HTTP rules](api-rules.md) | Runtime boundaries, Prisma models and migrations, shared Zod schemas, session and engagement handlers |
| I3, P1–P4, F5, R5 | [Backend](backend.md), [database](database.md), [provider briefs](../implementation/commissions.md) | Durable inbox, verified provider adapters, attribution, replay and coverage |
| L4, S6, O6 | [Database](database.md), [backend](backend.md), [HTTP contract](openapi.yaml), [release brief](../implementation/release.md) | Traceable statement, independent subscription billing, recoverable API and worker |
| U1, U2, U4, U5, W7 | [Frontend](frontend.md), [HTTP rules](api-rules.md), [OpenAPI](openapi.yaml) | Working Vue routes and typed API calls; public Nuxt website last |

The PostgreSQL DDL defines the physical storage target. Implement one reviewed Prisma migration per vertical slice and use custom SQL when a constraint cannot be represented in Prisma. The OpenAPI 3.1 document defines the wire contract. Changes to either contract travel with their affected handlers, UI consumers, and examples.

## Reference values and policy choices

For the reference statement, commission is calculated per sale on cash collected after discounts, excluding tax and before provider fees. The sample agreement pays 20%, monthly, due on the tenth of the following month. Configuration in this revision supports monthly due days 1–28 and whole basis points. These are V1 design choices. Confirm agreement policy, currency support, due dates, opening balances and fee treatment with the pilot before enabling live balances. Never substitute an estimate for an unknown commission basis.

The delivery queue remains the place to coordinate ownership. Read the technical document for your slice, identify its database keys, operation IDs and consuming route, then hand over the exact request and observed result. Follow [phase audits and stack checks](../implementation/quality.md) for verification timing. Deployment and production credentials remain separately scoped.
