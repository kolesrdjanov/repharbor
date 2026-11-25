# Local provider fixtures

Each file contains a test-mode connection and sanitized provider request bodies. The fixtures describe expected financial effects before any relevant attribution or terms. Supply a synthetic credential in the local founder UI with `ALLOW_LOCAL_PROVIDER_FIXTURES=true`. Use the new connection ID in the webhook path.

- [Stripe](stripe.json) uses a synthetic `whsec_` key and a fresh Stripe signature over the serialized body.
- [Dodo Payments](dodo.json) uses a synthetic `whsec_` key containing base64-encoded signing bytes. Supply a unique Webhook-ID per body and a fresh Webhook-Timestamp and Webhook-Signature.
- [Whop](whop.json) uses a synthetic `ws_` key and raw Standard Webhooks signature. Match Webhook-ID to the event ID in each body.
- [RevenueCat](revenuecat.json) uses the exact synthetic authorization header entered when connecting.

Exercise duplicates by delivering the same economic ID twice. Use distinct source accounts or clear disposable fixtures between otherwise identical independent runs. Timings in these bodies are historical examples.
