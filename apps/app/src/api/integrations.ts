import { connection, coverageGap, id, page, productMapping, reviewItem } from '@repharbor/contracts';
import { z } from 'zod';
import { request, type RequestBody } from './client';

const company = (id: string) => `/companies/${encodeURIComponent(id)}`;
const source = (companyId: string, sourceId: string) => `${company(companyId)}/connections/${encodeURIComponent(sourceId)}`;
const query = (cursor?: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
const body = (payload?: unknown, requestKey?: string): RequestInit => ({
  method: 'POST', body: payload === undefined ? undefined : JSON.stringify(payload),
  headers: requestKey ? { 'Idempotency-Key': requestKey } : undefined,
});

export const listConnections = (companyId: string, cursor?: string, signal?: AbortSignal) =>
  request(`${company(companyId)}/connections${query(cursor)}`, { signal }, page(connection));
export const connect = (companyId: string, input: RequestBody<'connectProvider'>) =>
  request(`${company(companyId)}/connections`, body(input), connection);
export const reconnect = (companyId: string, connectionId: string, input: RequestBody<'reconnectProvider'>) =>
  request(`${source(companyId, connectionId)}/reconnect`, body(input), connection);
export const disconnect = (companyId: string, connectionId: string) =>
  request(`${source(companyId, connectionId)}/disconnect`, body(), connection);
export const mappings = (companyId: string, connectionId: string, cursor?: string, signal?: AbortSignal) =>
  request(`${source(companyId, connectionId)}/mappings${query(cursor)}`, { signal }, page(productMapping));
export const saveMappings = (companyId: string, connectionId: string, input: RequestBody<'setMappings'>) =>
  request(`${source(companyId, connectionId)}/mappings`, { ...body(input), method: 'PUT' }, page(productMapping));
export const listReview = (companyId: string, cursor?: string, signal?: AbortSignal) =>
  request(`${company(companyId)}/review${query(cursor)}`, { signal }, page(reviewItem));
export const resolveReview = (companyId: string, reviewId: string, input: RequestBody<'resolveReviewItem'>, key: string) =>
  request(`${company(companyId)}/review/${encodeURIComponent(reviewId)}/resolve`, body(input, key), reviewItem);
export const coverage = (companyId: string, connectionId: string, cursor?: string, signal?: AbortSignal) =>
  request(`${source(companyId, connectionId)}/coverage${query(cursor)}`, { signal }, page(coverageGap));
export const requestImport = (companyId: string, connectionId: string, input: RequestBody<'requestBackfill'>, key: string) =>
  request(`${source(companyId, connectionId)}/backfills`, body(input, key), z.strictObject({ jobId: id }));
