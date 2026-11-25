import { Body, Controller, Delete, Get, Header, HttpCode, Module, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { exchangeMagicLink, requestMagicLink } from '@repharbor/contracts';
import { readConfiguration } from '../config';
import { ApiError, parseInput } from '../http';
import { AuthService } from './auth.service';

const COOKIE = 'rh_session';

export function sessionCookie(request: Request) {
  const entries = (request.headers.cookie ?? '').split(';');
  for (const item of entries) {
    const match = item.trim().match(/^rh_session=([A-Za-z0-9_-]{43})$/);
    if (match) return match[1];
  }
  return undefined;
}

export function checkOrigin(request: Request, origin: string) {
  if (request.get('Origin') !== origin) {
    throw new ApiError(403, 'ORIGIN_DENIED', 'Open the RepHarbor app to continue.');
  }
}

@Controller('auth')
class AuthController {
  private readonly config = readConfiguration();
  private readonly cookieOptions: CookieOptions = {
    httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax', path: '/',
  };

  constructor(private readonly auth: AuthService) {}

  @Post('magic-links')
  @HttpCode(202)
  async request(@Body() body: unknown, @Req() request: Request) {
    checkOrigin(request, this.config.APP_ORIGIN);
    await this.auth.requestLink(parseInput(requestMagicLink, body), request.ip ?? 'unknown');
  }

  @Post('sessions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async exchange(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    checkOrigin(request, this.config.APP_ORIGIN);
    const { token } = parseInput(exchangeMagicLink, body);
    const result = await this.auth.exchange(token, request.ip ?? 'unknown');
    response.cookie(COOKIE, result.sessionToken, { ...this.cookieOptions, expires: result.expiresAt });
    return result.payload;
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async current(@Req() request: Request) {
    return this.auth.serialize(await this.auth.requireSession(sessionCookie(request)));
  }

  @Delete('session')
  @HttpCode(204)
  async signOut(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    checkOrigin(request, this.config.APP_ORIGIN);
    const session = await this.auth.requireSession(sessionCookie(request));
    await this.auth.revoke(session.id);
    response.clearCookie(COOKIE, this.cookieOptions);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
