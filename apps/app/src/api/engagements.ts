import {
  agreement, claim, company, engagement, engagementContext, engagementPage, invitation, invitationPreview, page, product,
} from '@repharbor/contracts';
import { request, type RequestBody } from './client';

const post = (body?: unknown, key?: string): RequestInit => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: key ? { 'Idempotency-Key': key } : undefined,
});
const paged = (cursor?: string) => cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
const companyPath = (id: string) => `/companies/${encodeURIComponent(id)}`;
const engagementPath = (id: string) => `/engagements/${encodeURIComponent(id)}`;

export const createCompany = (body: RequestBody<'createCompany'>) => request('/companies', post(body), company);
export const listProducts = (id: string, cursor?: string, signal?: AbortSignal) =>
  request(`${companyPath(id)}/products${paged(cursor)}`, { signal }, page(product));
export const createProduct = (id: string, body: RequestBody<'createProduct'>) =>
  request(`${companyPath(id)}/products`, post(body), product);
export const companyDashboard = (id: string, cursor?: string, signal?: AbortSignal) =>
  request(`${companyPath(id)}/engagements${paged(cursor)}`, { signal }, engagementPage);
export const portfolio = (cursor?: string, signal?: AbortSignal) =>
  request(`/portfolio/engagements${paged(cursor)}`, { signal }, engagementPage);
export const inviteRep = (id: string, body: RequestBody<'inviteRep'>, key: string) =>
  request(`${companyPath(id)}/invitations`, post(body, key), invitation);
export const inviteFounder = (body: RequestBody<'inviteFounder'>, key: string) =>
  request('/portfolio/invitations', post(body, key), invitation);
export const previewInvitation = (body: RequestBody<'previewInvitation'>) =>
  request('/invitations/preview', post(body), invitationPreview);
export const acceptInvitation = (body: RequestBody<'acceptInvitation'>) =>
  request('/invitations/accept', post(body), engagement);
export const revokeInvitation = (id: string) =>
  request(`/invitations/${encodeURIComponent(id)}/revoke`, post());
export const getEngagement = (id: string, signal?: AbortSignal) =>
  request(engagementPath(id), { signal }, engagementContext);
export const listAgreements = (id: string, cursor?: string, signal?: AbortSignal) =>
  request(`${engagementPath(id)}/agreements${paged(cursor)}`, { signal }, page(agreement));
export const proposeAgreement = (id: string, body: RequestBody<'proposeAgreement'>) =>
  request(`${engagementPath(id)}/agreements`, post(body), agreement);
export const acceptAgreement = (id: string, agreementId: string, body: RequestBody<'acceptAgreement'>) =>
  request(`${engagementPath(id)}/agreements/${encodeURIComponent(agreementId)}/accept`, post(body), agreement);
export const closeEngagement = (id: string) =>
  request(`${engagementPath(id)}/close`, post(), engagement);
export const listClaims = (id: string, cursor?: string, signal?: AbortSignal) =>
  request(`${engagementPath(id)}/claims${paged(cursor)}`, { signal }, page(claim));
export const registerClaim = (id: string, body: RequestBody<'registerClaim'>) =>
  request(`${engagementPath(id)}/claims`, post(body), claim);
export const decideClaim = (id: string, claimId: string, body: RequestBody<'decideClaim'>) =>
  request(`${engagementPath(id)}/claims/${encodeURIComponent(claimId)}/decision`, post(body), claim);

export async function loadAll<T>(load: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>) {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const result = await load(cursor);
    items.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor);
  return items;
}
