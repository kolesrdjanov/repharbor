import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest();

export function seal(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function unseal(value: string, key: Buffer) {
  const payload = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  cipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([cipher.update(payload.subarray(28)), cipher.final()]).toString('utf8');
}
