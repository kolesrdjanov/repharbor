import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { apiError } from '@repharbor/contracts';

type ErrorBody = Omit<z.infer<typeof apiError>, 'requestId'>;

export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, fieldErrors?: ErrorBody['fieldErrors']) {
    super({ code, message, ...(fieldErrors && { fieldErrors }) }, status);
  }
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string[]> = Object.create(null);
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.') || '$';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  throw new ApiError(400, 'INVALID_REQUEST', 'Check the submitted information.', fieldErrors);
}

export function assignRequestId(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('X-Request-ID', randomUUID());
  next();
}

const standardErrors: Record<number, ErrorBody> = {
  400: { code: 'INVALID_REQUEST', message: 'Check the submitted information.' },
  401: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
  403: { code: 'FORBIDDEN', message: 'This action is unavailable in your current role.' },
  404: { code: 'NOT_FOUND', message: 'This resource is unavailable.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = String(response.getHeader('X-Request-ID') ?? randomUUID());
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) this.logger.error(`Request ${requestId} failed with HTTP ${status}`);
    const body = exception instanceof ApiError ? exception.getResponse()
      : standardErrors[status] ?? { code: 'REQUEST_FAILED', message: 'The request could not be completed.' };
    response.setHeader('X-Request-ID', requestId);
    response.status(status).json({ ...body as ErrorBody, requestId });
  }
}
