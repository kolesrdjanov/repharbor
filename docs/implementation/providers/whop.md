# Whop revenue source

Enter the Whop account ID, account-scoped API key, and raw `ws_` webhook secret. Select Sandbox or Production to match the endpoint. Configure Whop with a current API version date and subscribe to `payment.succeeded`, `refund.created`, and `refund.updated`. The adapter accepts the documented account field and its legacy company alias, verifies raw body signatures, and checks the signed account.

The adapter uses the buyer-facing currency and the exact decimal amount after discounts, less collected tax. Map the product ID, or the variant/plan ID if the resource has no product. Link the buyer ID or membership to an approved claim. A membership ending does not refund a payment. When refund currency or tax allocation cannot be matched to the original sale, the item needs review.

Payment and refund lists use account-scoped cursor pagination. Verify the historical coverage range and read permissions with sandbox credentials. The `biz_fixture_` mode uses signed synthetic deliveries.

[Whop webhooks](https://docs.whop.com/developer/guides/webhooks) · [Payments](https://docs.whop.com/api-reference/payments/list-payments) · [Refunds](https://docs.whop.com/api-reference/refunds/list-refunds)
