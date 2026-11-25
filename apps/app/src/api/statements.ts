import { entry, externalPayment, opening, statement } from '@repharbor/contracts';
import { z } from 'zod';
import { request, type RequestBody } from './client';

const endpoint = (id: string) => `/engagements/${encodeURIComponent(id)}`;

export const getStatement = (id: string, options: { currency?: string; cursor?: string }, signal?: AbortSignal) => {
  const query = new URLSearchParams();
  if (options.currency) query.set('currency', options.currency);
  if (options.cursor) query.set('cursor', options.cursor);
  return request(`${endpoint(id)}/statement?${query}`, { signal }, statement);
};

export const getEntry = (id: string, entryId: string, signal?: AbortSignal) =>
  request(`${endpoint(id)}/entries/${encodeURIComponent(entryId)}`, { signal }, entry);

const post = (key: string, body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Idempotency-Key': key },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const recordPayment = (id: string, key: string, body: RequestBody<'recordExternalPayment'>) =>
  request(`${endpoint(id)}/payments`, post(key, body), externalPayment);
export const reversePayment = (id: string, paymentId: string, key: string, body: RequestBody<'reverseExternalPayment'>) =>
  request(`${endpoint(id)}/payments/${encodeURIComponent(paymentId)}/reverse`, post(key, body), entry);
export const openingBalances = (id: string, signal?: AbortSignal) =>
  request(`${endpoint(id)}/opening-balances`, { signal }, z.array(opening));
export const proposeOpening = (id: string, key: string, body: RequestBody<'proposeOpeningBalance'>) =>
  request(`${endpoint(id)}/opening-balances`, post(key, body), opening);
export const acceptOpening = (id: string, openingId: string, key: string) =>
  request(`${endpoint(id)}/opening-balances/${encodeURIComponent(openingId)}/accept`, post(key), opening);
