# Stripe revenue source

Use the founder's Stripe revenue account and the dedicated sales webhook `/v1/webhooks/stripe/{connectionId}`. Configure a matching environment, account ID, server-side API key with the required account, invoice, invoice-payment and event read access, and endpoint signing secret. Subscribe to `invoice.paid`, `refund.created`, and `refund.updated`. Stripe's account settings control the API version of webhook payloads. Keep RepHarbor subscription credentials and webhook separate.

- A paid invoice must have a confirmed Stripe InvoicePayment for automatic attribution. An invoice marked paid out of band yields no collection. Each invoice line has its own financial key.
- The line subtotal, pretax discounts or credits, and taxes must reconcile to the actual invoice payment. Uncertain collection or basis becomes reviewable.
- Map the Stripe product ID from `pricing.price_details.product` or the legacy `price.product` field. Match by the Stripe customer ID after founder review.
- A successful refund links through the original PaymentIntent. A refund that arrives first waits for the original. A refund that could match multiple lines needs allocation review.
- Source history uses Stripe's Events API. The provider retains events for 30 days. The adapter reports unavailable earlier history for reconciliation.

Local development can connect an account beginning `acct_fixture_` with a synthetic `whsec_` secret and no API key when `ALLOW_LOCAL_PROVIDER_FIXTURES=true`. Sign the raw fixture bytes with the synthetic secret using the Stripe SDK test helper. The worker processes the fixture through the same inbox and financial effect keys. Production requires live mode and disables fixture connection setup.

[Stripe webhooks](https://docs.stripe.com/webhooks) · [Invoice lines](https://docs.stripe.com/api/invoice-line-item/object) · [Invoice payments](https://docs.stripe.com/api/invoice-payment/object) · [Refunds](https://docs.stripe.com/api/refunds/object)
