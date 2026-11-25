# Phases 6–7 · Pilot, deployment, billing, and website

The [work queue](README.md) identifies prerequisites. Finish the private application and pilot release work before starting the public website.

## O6 · Deployable private app and operational recovery

**Owner:** tooling/operations. **Outputs:** API Docker image, Railway service definitions, private app Cloudflare configuration, and a short operator runbook.

1. Build one Docker image with API and worker entry points. Define separate Railway services and PostgreSQL. Apply migrations once per release before starting dependent code. Store database, session, encryption, Resend and connection secrets in environment-specific secret stores.
2. Build the private Vue app for Cloudflare at app.repharbor.io and configure SPA deep-link routing. Serve the API at api.repharbor.io. Configure the exact frontend origin, credentialed session requests, canonical email-link origin, health checks, and environment-specific callback URLs. Exercise the link flow in the deployed browser context.
3. Set up the Resend sender and verify delivery to a controlled inbox when access is available. Configure production and sandbox providers separately. Register webhooks against the correct public API endpoint. A connection's status should indicate setup or credential issues without disclosing secrets.
4. Capture structured request and job identifiers, queue age, retry failures, sync gaps, and database health. Define backup retention and restore steps. Rehearse restore on a disposable database and replay from retained source records before accepting a live pilot.
5. Keep deploys explicit while push-triggered CI is deferred. Document how to deploy app/API/worker, identify the running revision, and roll back to a compatible image. Record any migration that limits rollback.

**Acceptance:** A direct private app URL works after refresh, a Resend link signs in, the worker resumes a pending job after restart, and a restored test database reproduces the reference balance. If external credentials are unavailable, hand off the exact pending environment step and distinguish it from locally demonstrated behavior.

## S6 · RepHarbor subscription billing

**Owner:** backend with a small founder-facing billing view. **Depends on:** company identity and a commercially approved price for live charging.

- Integrate Stripe Billing for the company's RepHarbor subscription. Use a separate account context, configuration, webhook secret, subject IDs, and processing path from customer-sales ingestion. Keep test-mode flows usable while price and launch date are undecided.
- Expose founder-authorized subscription setup and billing management. Persist the mapping from company to billing customer and subscription. Treat authenticated provider events as authoritative for billing state and handle duplicate delivery, cancellation and payment failure.
- Confirm pricing and access policy before enabling live checkout or enforcing feature restrictions. Preserve access to historical commission records according to the approved policy. The pilot can proceed before commercial billing activation.

**Acceptance:** A test subscription updates only its company's billing state, a replay has no additional effect, and the subscription charge never appears as a rep commission. A rep cannot open the founder's billing session.

## E6 · Pilot statement and release review

**Owner:** pilot/release. **Inputs:** O6, U4, U5, F5, R5 and evidence for P1–P4.

1. Select a real pilot product and confirm in writing the accepted commission basis, eligibility period, effective dates, timezone, currency, coverage start, opening balance, and handling of refunds and amendments. Record only anonymized examples in the repo.
2. Rehearse the Konvuno/Dimitrije €230 case. Include a repeat event, two providers reporting the same purchase, an external payment submitted twice, and a rep attempting to open an unrelated account. Pair the expected amounts with the actual statement line IDs in pilot evidence.
3. Run a full monthly statement with both parties. Compare each attributed sale and refund to the underlying provider data, each external payment to the founder's record, and the due-date calculation to the accepted terms. Track unresolved items and coverage gaps explicitly.
4. Review setup time, manual matches, and questions about the balance. Record which integrations were exercised locally, in provider test mode, or in the pilot. A single pilot company can cover one provider; retain separate provider evidence for the other three.
5. At final review, decide which repository-wide checks or CI jobs to introduce. Keep their cost and trigger policy explicit.

**Acceptance:** Both users can independently explain the same balance and its due date, identify manual payment records, and find calculation evidence for an entry. Unresolved entries have an owner and a visible status. All four adapters have the coverage evidence defined in the [provider briefs](commissions.md).

## W7 · Public Nuxt website, last

**Owner:** website/frontend. **Starts after:** private app and pilot release work. **Paths:** apps/site and its Cloudflare deployment configuration.

- Use Nuxt with prerendered or server-rendered public pages on repharbor.io. Apply Chrome Modern Web Guidance and UI UX Pro Max when building the site. Keep the monochrome visual language and use shadcn-vue for UI components.
- Build the home page around the founder's use case, explain the rep's view, add integration pages for Stripe, Dodo Payments, Whop, and RevenueCat, and publish one worked statement example. Explain recorded external payments accurately. The primary action leads to the app's email sign-in or invitation workflow. Publish pricing only once approved.
- Give each page a descriptive title, unique description, canonical URL, semantic heading structure, real internal links, and accessible HTML content. Include a sitemap and robots policy for the public origin. Keep private app routes outside the sitemap. Use structured data only where the page actually supports it. Clear answers and examples should be readable by search and AI crawlers.
- Configure Cloudflare for the public hostname independently of the private app. Confirm app links point to the correct environment and provider pages accurately describe supported coverage.

**Acceptance:** Open the home page and each integration page with client-side JavaScript disabled. Main copy, headings and navigation remain readable. Following the primary action reaches the live app sign-in flow. The public example reconciles to €230 and public pages expose only sample data.
