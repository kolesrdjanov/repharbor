import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../http';
import type { DeliveryHeaders, Source } from '../provider';

export const dateString = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
export const minorInteger = z.number().int().nonnegative();
export const currencyCode = z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());

export function authError() {
  return new ApiError(401, 'WEBHOOK_AUTH_FAILED', 'Delivery authentication failed.');
}

export function signaturePayload(body: Buffer, headers: DeliveryHeaders, key: Buffer) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];
  if (!key.length || typeof id !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string'
      || !/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw authError();
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest();
  const valid = signature.split(/\s+/).some((value) => {
    if (!value.startsWith('v1,')) return false;
    const candidate = Buffer.from(value.slice(3), 'base64');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  });
  if (!valid) throw authError();
  return id;
}

export function parsePayload<T>(body: Buffer, schema: z.ZodType<T>) {
  try {
    return schema.parse(JSON.parse(body.toString('utf8')));
  } catch {
    throw new ApiError(400, 'INVALID_PROVIDER_EVENT', 'The authenticated payload could not be read.');
  }
}

export function exactHeader(value: string | string[] | undefined, expected: string | undefined) {
  if (typeof value !== 'string' || !expected) throw authError();
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(value), digest(expected))) throw authError();
}

export async function fetchData<T>(url: URL, source: Source, schema: z.ZodType<T>, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${source.credentials.apiKey}`, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Provider data could not be retrieved.');
  }
  return schema.parse(await response.json());
}

export function checkAccount(expected: string, actual?: string | null) {
  if (actual !== undefined && actual !== null && actual !== expected) {
    throw new ApiError(403, 'SOURCE_MISMATCH', 'The authenticated delivery does not match the source configuration.');
  }
}

export function fixture(source: Source, enabled: boolean, prefix: string) {
  return enabled && source.environment === 'test' && source.externalAccount.startsWith(prefix) && !source.credentials.apiKey;
}

export function minorFromMajor(value: string | number, currency: string, precision?: number) {
  const exponent = Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  if (precision !== undefined && exponent !== precision) return undefined;
  const [major, fraction = ''] = String(value).replace(/^-/, '').split('.');
  if (!/^\d+$/.test(major) || !/^\d*$/.test(fraction) || /[^0]/.test(fraction.slice(exponent))) return undefined;
  const result = BigInt(major) * 10n ** BigInt(exponent) + BigInt(fraction.slice(0, exponent).padEnd(exponent, '0') || '0');
  return String(value).startsWith('-') ? -result : result;
}
