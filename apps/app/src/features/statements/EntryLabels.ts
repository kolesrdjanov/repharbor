import type { components } from '@repharbor/contracts';

export const entryNames: Record<components['schemas']['StatementEntry']['kind'], string> = {
  commission: 'Commission',
  refund: 'Refund adjustment',
  refund_reversal: 'Refund reversal',
  external_payment: 'External payment',
  opening: 'Opening balance',
  reversal: 'Reversal',
};
