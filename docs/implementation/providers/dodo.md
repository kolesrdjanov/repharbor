# Dodo Payments revenue source

Enter the Dodo business ID, webhook signing secret, and API key for the selected environment. Subscribe to `payment.succeeded` and `refund.succeeded`. Dodo payment and refund values are in minor units. The adapter authenticates the raw Standard Webhooks body, checks the signed business ID, and reads the resource from the selected environment when credentials are available.

A single identified product with known tax can be attributed. When Dodo supplies one subscription ID, the API can look up the subscription's product. An unsupported multi-product allocation or missing tax stays in review. Collections and refunds use the original payment ID to match, including when a refund arrives first. Pending payments, failed payments, zero-amount payments, and subscription cancellation do not produce a financial effect.

The history worker uses the payment and refund list APIs with date filters. Verify product and timing coverage on a sandbox account, especially for customers with plan changes and older payments. The local `bus_fixture_` mode uses signed synthetic deliveries.

[Dodo webhooks](https://docs.dodopayments.com/developer-resources/webhooks) · [Payment detail](https://docs.dodopayments.com/api-reference/payments/get-payments-1) · [Refund history](https://docs.dodopayments.com/api-reference/refunds/get-refunds)
