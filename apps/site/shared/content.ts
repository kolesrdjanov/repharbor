export const providers = [
  {
    slug: 'stripe', name: 'Stripe', summary: 'Itemized invoices, customer matching, and refund adjustments.',
    details: [
      'Connect the revenue account that collects your customer payments. RepHarbor matches Stripe product and customer identifiers to your product and approved claims.',
      'A confirmed Stripe invoice payment can be attributed by invoice line. Refunds link to the original payment. A refund that spans several lines may require review.',
      'The Stripe Events API supplies up to 30 days of event history. Earlier periods can leave a coverage gap.',
    ],
    link: 'https://docs.stripe.com/webhooks',
  },
  {
    slug: 'dodo-payments', name: 'Dodo Payments', summary: 'Paid renewals and identifiable refunds from a Dodo business.',
    details: [
      'Connect the Dodo business in its test or live environment. Map product identifiers and link the provider’s customer identity to an approved claim.',
      'RepHarbor tracks successful payments and refunds. A payment without a known tax amount or a clear product allocation goes to review.',
      'Use the provider’s payment and refund history to check coverage, especially across plan changes.',
    ],
    link: 'https://docs.dodopayments.com/developer-resources/webhooks',
  },
  {
    slug: 'whop', name: 'Whop', summary: 'Account-scoped payments by product or plan, with tracked refunds.',
    details: [
      'Connect your Whop account and map the product or plan that the customer purchased. RepHarbor tracks confirmed payments and ties each to a buyer or membership.',
      'A membership ending does not refund a payment. Where a refund cannot be matched or allocated to the original sale, it goes to review.',
      'Review coverage for your test or live account and confirm that the configured credential can read both payments and refunds.',
    ],
    link: 'https://docs.whop.com/developer/guides/webhooks',
  },
  {
    slug: 'revenuecat', name: 'RevenueCat', summary: 'Store purchase and renewal evidence, with estimated amounts flagged for review.',
    details: [
      'Connect a RevenueCat project and app. Match the store product and App User ID to your product and approved claim.',
      'RevenueCat events can report completed purchases, paid renewals, and refund activity. Estimated tax and incomplete refund data require review before a commission can be calculated.',
      'When Stripe and RevenueCat report the same web sales, configure one authoritative source for that product and channel. Historical import through this connection is unavailable.',
    ],
    link: 'https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields',
  },
] as const;

export const publicRoutes = [
  '/', '/for-sales-reps', '/commission-example', '/integrations',
  ...providers.map(({ slug }) => `/integrations/${slug}`),
];
