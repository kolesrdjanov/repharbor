# RevenueCat revenue source

Enter the project and app as `project_id/app_id`. Use a RevenueCat API v2 read key to verify app scope, and the exact authorization header configured on the webhook. Scope the connection to the matching sandbox or production environment. Map store product IDs and the customer's App User ID. The adapter considers signed aliases before falling back to an unresolved anonymous ID.

Initial purchases, renewals, and non-renewing purchases deduplicate by store transaction. An ordinary cancellation keeps past collections. A confirmed monetary cancellation and a refund reversal stay reviewable when there is no exact basis. Store-reported price and estimated tax cannot establish the agreed collected, tax-exclusive basis. Web purchases use the web channel so a primary Stripe source can keep a second observation from creating another commission.

This adapter reports history unavailable through this import path. RevenueCat account-plan access, exact store-basis evidence, and complete historical refunds require separate provider verification. The `proj_fixture_` mode uses synthetic authenticated deliveries.

[RevenueCat event fields and coverage](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
