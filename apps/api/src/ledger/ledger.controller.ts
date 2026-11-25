import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { id, proposeOpening, recordExternalPayment, reversePayment, statementQuery } from '@repharbor/contracts';
import { AuthModule, checkOrigin, sessionCookie } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { readConfiguration } from '../config';
import { parseInput } from '../http';
import { Payments } from './payments';
import { Statements } from './statements';

@Controller('engagements/:engagementId')
class LedgerController {
  private readonly origin = readConfiguration().APP_ORIGIN;

  constructor(
    private readonly auth: AuthService,
    private readonly statements: Statements,
    private readonly payments: Payments,
  ) {}

  private async actor(req: Request) {
    if (req.method !== 'GET') checkOrigin(req, this.origin);
    const current = await this.auth.requireSession(sessionCookie(req));
    return { id: current.id, userId: current.userId, email: current.user.email, pendingInvitationId: current.pendingInvitationId };
  }

  @Get('statement')
  async statement(@Req() req: Request, @Param('engagementId') engagementId: string, @Query() query: unknown) {
    return this.statements.read(await this.actor(req), parseInput(id, engagementId), parseInput(statementQuery, query));
  }

  @Get('entries/:entryId')
  async entry(@Req() req: Request, @Param('engagementId') engagementId: string, @Param('entryId') entryId: string) {
    return this.statements.entry(await this.actor(req), parseInput(id, engagementId), parseInput(id, entryId));
  }

  @Post('payments')
  async payment(@Req() req: Request, @Param('engagementId') engagementId: string, @Body() body: unknown) {
    return this.payments.record(await this.actor(req), parseInput(id, engagementId), parseInput(id, req.get('Idempotency-Key')),
      parseInput(recordExternalPayment, body));
  }

  @Post('payments/:paymentId/reverse')
  @HttpCode(200)
  async reverse(
    @Req() req: Request, @Param('engagementId') engagementId: string, @Param('paymentId') paymentId: string, @Body() body: unknown,
  ) {
    return this.payments.reverse(await this.actor(req), parseInput(id, engagementId), parseInput(id, paymentId),
      parseInput(id, req.get('Idempotency-Key')), parseInput(reversePayment, body).reason);
  }

  @Get('opening-balances')
  async opening(@Req() req: Request, @Param('engagementId') engagementId: string) {
    return this.payments.openingList(await this.actor(req), parseInput(id, engagementId));
  }

  @Post('opening-balances')
  async propose(@Req() req: Request, @Param('engagementId') engagementId: string, @Body() body: unknown) {
    return this.payments.propose(await this.actor(req), parseInput(id, engagementId),
      parseInput(id, req.get('Idempotency-Key')), parseInput(proposeOpening, body));
  }

  @Post('opening-balances/:openingId/accept')
  @HttpCode(200)
  async accept(@Req() req: Request, @Param('engagementId') engagementId: string, @Param('openingId') openingId: string) {
    return this.payments.accept(await this.actor(req), parseInput(id, engagementId), parseInput(id, openingId),
      parseInput(id, req.get('Idempotency-Key')));
  }
}

@Module({ imports: [AuthModule], providers: [Payments, Statements], controllers: [LedgerController] })
export class LedgerModule {}
