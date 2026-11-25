import { z } from 'zod';

const apiOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
});

const config = apiOrigin.safeParse(import.meta.env.VITE_API_ORIGIN);
if (!config.success) {
  throw new Error('Set VITE_API_ORIGIN to the API HTTP(S) origin without a trailing slash.');
}
export const API_ORIGIN = config.data;
