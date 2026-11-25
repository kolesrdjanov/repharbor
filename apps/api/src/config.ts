import 'dotenv/config';
import { z } from 'zod';

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Use an HTTP(S) origin without a path or trailing slash.');

const port = z.coerce.number().int().min(1).max(65535);
const configuration = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  APP_ORIGIN: origin,
  API_ORIGIN: origin,
  PORT: port,
  WORKER_HEALTH_PORT: port,
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(31_536_000),
  MAIL_TRANSPORT: z.enum(['smtp', 'resend']),
  MAIL_FROM: z.string().trim().min(1),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
}).superRefine((env, context) => {
  if (env.MAIL_TRANSPORT === 'smtp' && (!env.SMTP_URL || env.NODE_ENV === 'production')) {
    context.addIssue({
      code: 'custom', path: ['MAIL_TRANSPORT'],
      message: 'SMTP capture requires SMTP_URL and a development or test environment.',
    });
  }
  if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Required for Resend.' });
  }
  if (env.NODE_ENV === 'production' && (!env.APP_ORIGIN.startsWith('https:') || !env.API_ORIGIN.startsWith('https:'))) {
    context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'Production origins require HTTPS.' });
  }
});

export function readConfiguration() {
  const result = configuration.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid server configuration\n${issues.join('\n')}`);
  }
  return result.data;
}
