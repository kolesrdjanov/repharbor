import type { components } from './wire';

export const referenceIds = {
  founder: '4f26c000-8497-4928-a2e1-000000000001',
  rep: '4f26c000-8497-4928-a2e1-000000000002',
  unrelatedFounder: '4f26c000-8497-4928-a2e1-000000000003',
  unrelatedRep: '4f26c000-8497-4928-a2e1-000000000004',
  company: '4f26c000-8497-4928-a2e1-000000000005',
  unrelatedCompany: '4f26c000-8497-4928-a2e1-000000000006',
  product: '4f26c000-8497-4928-a2e1-000000000007',
  engagement: '4f26c000-8497-4928-a2e1-000000000008',
  agreement: '4f26c000-8497-4928-a2e1-000000000009',
  unrelatedProduct: '4f26c000-8497-4928-a2e1-000000000010',
  unrelatedEngagement: '4f26c000-8497-4928-a2e1-000000000011',
} as const;

export const referenceCompany = { id: referenceIds.company, name: 'Konvuno', timeZone: 'Europe/Belgrade' };
export const founderSession = {
  userId: referenceIds.founder, email: 'founder@konvuno.test', companies: [referenceCompany],
} satisfies components['schemas']['Session'];
export const repSession = {
  userId: referenceIds.rep, email: 'dimitrije@repharbor.test', companies: [],
} satisfies components['schemas']['Session'];

export const proposedAgreement = {
  id: referenceIds.agreement,
  engagementId: referenceIds.engagement,
  revision: 1,
  rateBps: 2000,
  basis: 'collected_ex_tax_before_fees',
  accrualMode: 'recurring',
  eligibilityMonths: 12,
  refundPolicy: 'reverse_original_rate',
  cadence: 'monthly',
  dueDay: 10,
  timeZone: referenceCompany.timeZone,
  effectiveAt: '2026-10-31T23:00:00Z',
  founderAcceptedAt: '2026-10-31T12:00:00Z',
} satisfies components['schemas']['AgreementVersion'];

export const referenceSales = Array.from({ length: 10 }, (_, index) => ({
  transactionKey: `invoice_fixture_${index + 1}`,
  customerKey: `customer_fixture_${index + 1}`,
  contactEmail: `customer-${index + 1}@example.test`,
  payerEmail: index === 0 ? 'finance@example.test' : `customer-${index + 1}@example.test`,
  date: `2026-11-${String(index + 2).padStart(2, '0')}T12:00:00Z`,
  basisMinor: '20000',
  currency: 'EUR',
}));

export const referencePayment = { currency: 'EUR', amountMinor: '15000', paidOn: '2026-11-18' };
export const referenceRefund = { sale: 'invoice_fixture_1', basisMinor: '10000', occurredAt: '2026-11-20T12:00:00Z' };
export const expectedBalance = {
  currency: 'EUR', accruedMinor: '38000', recordedPaymentsMinor: '15000',
  outstandingMinor: '23000', dueMinor: '23000', openingStatus: 'known',
} satisfies components['schemas']['Balance'];
