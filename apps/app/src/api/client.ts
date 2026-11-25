import { apiError, type operations } from '@repharbor/contracts';
import type { z } from 'zod';
import { API_ORIGIN } from '../config';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, options: RequestInit, schema: z.ZodType<T>): Promise<T>;
export async function request(path: string, options: RequestInit): Promise<void>;
export async function request<T>(path: string, options: RequestInit, schema?: z.ZodType<T>) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(new URL(`/v1${path}`, API_ORIGIN), {
      ...options, headers, credentials: 'include', cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RequestError(0, 'CONNECTION_FAILED', 'The app could not reach RepHarbor. Try again.');
  }
  if (!response.ok) {
    const error = apiError.safeParse(await response.json().catch(() => null));
    throw new RequestError(
      response.status,
      error.data?.code ?? 'REQUEST_FAILED',
      error.data?.message ?? 'The request could not be completed. Try again.',
      error.data?.fieldErrors,
    );
  }
  if (!schema) return;
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new RequestError(response.status, 'INVALID_RESPONSE', 'RepHarbor sent an unexpected response. Try again.');
  return parsed.data;
}

export function errorMessage(error: unknown) {
  return error instanceof RequestError ? error.message : 'Something went wrong. Try again.';
}

export type RequestBody<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { 'application/json': infer Body } };
} ? Body : never;
