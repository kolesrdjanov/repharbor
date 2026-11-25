import { z } from 'zod';
import { timestamp } from './base';

export const billing = z.strictObject({
  status: z.string().min(1), currentPeriodEnd: timestamp.optional(),
  checkoutAvailable: z.boolean().optional(), portalAvailable: z.boolean().optional(),
});
export const hostedBilling = z.strictObject({ url: z.url({ protocol: /^https$/ }) });
