# RepHarbor V1

**Product requirements, technical specification, and delivery plan**  
Draft · November 25, 2026

## 1. Product and scope

RepHarbor helps a founder and an independent sales rep answer three questions from the same statement. How much does the company owe the rep? Which sales earned that commission? When is payment due?

The founder adds the company, connects its sales data, and agrees on commission terms with the rep. The rep has a personal portfolio that can include agreements with several companies.

V1 covers invitations, per-product commission agreements, customer attribution, sales tracking through Stripe, Dodo Payments, Whop, and RevenueCat, commission statements, and manual records of payments made outside RepHarbor. The founder pays the rep externally. Public profiles, job postings, and rep discovery belong to the V2 marketplace.

**Pilot scenario.** Konvuno engages Dimitrije to sell one product. He brings in ten customers. Both parties can open the same statement, inspect each entry, and see the outstanding balance. Dimitrije can manage his other engagements in his portfolio. Each founder sees only the engagements associated with their company.

## 2. Roles and permissions

| Role | Actions | Visibility |
|---|---|---|
| Founder | Create a company and its products, connect providers, send or accept invitations, propose terms, review customer claims, and record external payments | Attributed sales for the company, statements by product and rep, and integration alerts |
| Sales rep | Create a portfolio, invite a company, accept terms, register prospective customers, and review statements | Their own engagements, attributed customers, commission entries, due dates, and recorded payment history |

Roles apply within a company and an engagement. One person can run one company and sell for another. A rep can invite a founder to start an engagement. The founder confirms the company and connects its sales data. Each company controls its own integrations.

## 3. User workflow and acceptance criteria

| Step | V1 requirement | Acceptance criteria |
|---|---|---|
| 1. Connect a product | The founder adds a company and product, connects a provider, and maps provider product identifiers to the RepHarbor product. | One provider account can serve multiple products. One product can use multiple providers. The founder can see connection status and the time of the last successful sync. |
| 2. Agree on terms | The founder invites a rep and proposes terms for a product. The rep reviews and accepts a specific version. | Both parties can see the rate, commission basis, eligibility period, refund policy, statement frequency, and payment deadline. RepHarbor records the accepted version and date. |
| 3. Register a customer | The rep registers a person or company for a product. The founder approves the claim or gives a reason for declining it. | The rep sees the decision. Competing claims for the same customer and product go to the founder for review. Each rep sees only their own claim. |
| 4. Match the first sale | RepHarbor links an approved claim to the provider's customer record. The founder confirms ambiguous matches. | If the rep introduced the CEO and the finance team paid using a different email address, the founder can link the correct record. The sale contributes to the balance only after attribution is resolved. |
| 5. Calculate commission | Each eligible payment or adjustment creates an entry linked to the customer, product, and applicable agreement version. | Both parties can open an entry and trace its calculation to the underlying sale. Renewals accrue to the same rep for as long as the agreement grants eligibility. |
| 6. Record an external payment | The founder enters the amount, currency, and date of a payment already sent to the rep. A payment reference is optional. | A partial payment reduces the outstanding balance. Both parties can see who entered it and when. The label “Recorded by founder” identifies the source. |
| 7. End an engagement | Closing an engagement stops new customer claims. Both parties retain access to its history and outstanding balance. | Existing customers continue to earn commission through the eligibility period defined in the agreement. |

## 4. Commission rules

**Proposed initial model.** An agreement pays a percentage of either the first eligible customer payment or every eligible payment during an agreed period. The period starts with the first eligible payment for the attributed customer and product. The proposed basis is the amount collected after discounts, excluding tax and before processing fees. If the provider supplies insufficient data to calculate the agreed basis, the entry is marked “Needs review.” Agreements based directly on contracted monthly or annual recurring revenue require a decision on payment timing, cancellations, and annual subscriptions.

| Product term | Calculation or behavior |
|---|---|
| Accrued commission | Sum of commissions on attributed payments and their adjustments. Each entry retains its basis, rate, currency, and agreement version. |
| Outstanding balance | Accrued commission less recorded external payments, by company, rep, and currency. A positive balance means the company owes the rep. |
| Amount due | The portion of the outstanding balance whose payment deadline has arrived. The proposed allocation applies an external payment to the oldest open entries for the same engagement and currency first. |
| Refund | A full or partial refund creates an adjustment at the original sale's commission rate. Cancellation stops commission on future renewals. |
| Overpayment | If a refund creates a negative balance after the rep has been paid in full, show the amount as a company credit toward the next statement. |
| Correction or amendment | Revised terms have an effective date and require acceptance by both parties. Existing entries retain their original terms. To correct a manual payment record, reverse the entry with a reason and record the correct amount. |
| Currency and rounding | Store monetary amounts in the currency's minor unit. The proposed rule rounds each calculated entry to the nearest minor unit. Show balances separately by currency. |

**Acceptance example.** Dimitrije brings Konvuno ten customers, each generating €200 in eligible sales. At 20%, he earns €400. Konvuno records a €150 external payment, leaving €250 outstanding. A subsequent refund of €100 in eligible sales reduces his commission by €20. Both accounts must show **€230 outstanding**, with the sales, external payment, and refund adjustment visible on the statement.

## 5. V1 screens

- **Founder dashboard.** Switch companies, see balances by rep and currency, review amounts due, and resolve pending customer claims or unmatched sales.
- **Rep portfolio.** See balances by company and currency, check the next payment deadline, and open an engagement.
- **Engagement details.** View the product, current and previous terms, registered customers, commission entries, and recorded external payments. Each party sees the shared statement and the actions available to their role.
- **Company integrations.** Connect a provider, map products, check the period covered and sync status, and resolve unmatched payments.
- **Invitation and acceptance.** Show the company, product, and full terms before acceptance. A rep can accept an invitation using an existing account.

## 6. Technical specification

| Component | Technology and responsibilities |
|---|---|
| App | Vue 3, TypeScript, Vite, Vue Router, Tailwind, Zod, and Pinia. Use monochrome shadcn-vue components exclusively. Apply UI UX Pro Max and Chrome Modern Web Guidance when building web UI. Deploy on Cloudflare. |
| Public website | Nuxt on Cloudflare. Serve crawlable HTML, stable URLs, canonical links, a sitemap, and pages explaining integrations and commission rules. Serve the public site and private app on separate hostnames. |
| Backend | NestJS, Prisma ORM, and Docker on Railway. Proposed deployment uses PostgreSQL, one backend repository, and one image for the API and background worker. |
| Identity and email | Use passwordless email magic links for sign-in and sign-up. Use Resend for authentication emails, invitations, and notifications. Enforce company and engagement permissions on every server-side read and write. |
| RepHarbor billing | Use Stripe to bill companies for their RepHarbor subscription. Keep this billing data separate from provider accounts connected to track customer sales. Pricing and the commercial launch date remain open. |

**Data model.** The core records are user, company, membership, product, engagement, agreement version, customer claim, provider customer mapping, source transaction, commission entry, and external payment record. A sale and the provider event reporting it have distinct identities. This lets the system recognize a repeated event and match a later refund to the original sale.

**Event processing.** Verify each event using the provider's authentication mechanism and persist it before acknowledging receipt. The worker retries failures. Repeated or concurrent processing must produce the same transaction and commission entries. Hold refunds that arrive before their original sales until they can be matched. Reconcile against provider records periodically where available. Show the founder any gaps in coverage or interruptions in synchronization.

**Provider integrations.** For each provider, verify customer and product identity, amount, tax, currency, renewals, refunds, historical import coverage, and required permissions. For Stripe and Dodo Payments, link the provider customer record to the approved claim. For Whop, verify the buyer and purchased product or plan. For RevenueCat, map the App User ID and store. If Stripe and RevenueCat both report a web purchase, use one authoritative source per product and sales channel. Where historical data is incomplete, show the earliest date from which coverage has been verified.

**Operations.** Request the minimum provider permissions, encrypt credentials, and isolate test events from production records. Before the pilot, verify a database restore from backup and configure alerts for failed financial event processing.

## 7. Delivery plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 1. Rules and source data | A sample Konvuno–Dimitrije agreement, a manually calculated reference statement, and a capability review for all four providers | The reference covers a one-time sale, renewal, different payer email, partial external payment, and refund. The team can identify the source for each calculation input. |
| 2. Engagement workflow | Accounts, companies, portfolios, invitations, agreement acceptance, and customer claims | Two users can agree on terms for one product. Access checks cover an unrelated company and another rep. |
| 3. First complete statement | The pilot company's first provider, customer matching, commission entries, balances, and external payment records | Both users reach the €230 reference balance. Replaying a provider event or submitting a payment record twice leaves the balance correct. |
| 4. Remaining integrations | The same workflow across Stripe, Dodo Payments, Whop, and RevenueCat, with provider-specific limitations visible | Each provider has a verified example. Overlapping sources accrue commission once. The founder can identify a disconnected integration or an unmatched transaction. |
| 5. Pilot and release | One complete statement cycle and a final operational review | Founder and rep reconcile the statement to source data, inspect adjustments, and see the same outstanding balance after an external payment is recorded. |

Build the public Nuxt website after the application pilot and release work. The [implementation plan](implementation/README.md) defines work packages, dependencies, and handoffs.

**Pilot measures.** Track time from invitation to agreement acceptance, the number of payments that require manual matching, and how often the rep needs to ask the founder to explain a balance. The main success signal is that both parties can complete their first monthly statement independently and use RepHarbor again in the next cycle.

## 8. Decisions before implementing commission calculations

1. **Commission basis and fees.** Confirm whether V1 uses amounts collected before fees and excluding tax, particularly for mobile stores. Confirm whether the pilot also needs a model based directly on MRR or ARR.
2. **Dates and amendments.** Confirm the company time zone, payment due-date rule, and how a rate change affects future renewals from previously attributed customers.
3. **Opening balances.** Choose a start date for existing agreements and define how to record an agreed opening balance when a provider's history is incomplete.
4. **Pilot reference case.** Select an actual product and provider used by the pilot company. Prepare one anonymized example to use throughout delivery.
