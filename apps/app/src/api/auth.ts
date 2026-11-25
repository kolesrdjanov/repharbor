import { session } from '@repharbor/contracts';
import { request, type RequestBody } from './client';

export const requestMagicLink = (body: RequestBody<'requestMagicLink'>) =>
  request('/auth/magic-links', { method: 'POST', body: JSON.stringify(body) });

export const exchangeMagicLink = (body: RequestBody<'exchangeMagicLink'>) =>
  request('/auth/sessions', { method: 'POST', body: JSON.stringify(body) }, session);

export const getSession = () => request('/auth/session', {}, session);
export const signOut = () => request('/auth/session', { method: 'DELETE' });
