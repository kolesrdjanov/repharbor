import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { backfillInput, connectProvider, id, pagination, providerName, reconnectProvider, resolveReview, setMappings } from '@repharbor/contracts';
import { AuthModule, checkOrigin, sessionCookie } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { readConfiguration } from '../config';
import { ApiError, parseInput } from '../http';
import { Attribution } from './attribution';
import { Connections } from './connections';
import { Inbox } from './inbox';
import { Reconciliation } from './reconciliation';
import { Providers } from './providers';

@Controller()
class IntegrationsController {
  private readonly origin = readConfiguration().APP_ORIGIN;

  constructor(
    private readonly auth: AuthService,
    private readonly connections: Connections,
    private readonly inbox: Inbox,
    private readonly attribution: Attribution,
    private readonly reconciliation: Reconciliation,
  ) {}

  private async actor(req: Request) {
    if (req.method !== 'GET') checkOrigin(req, this.origin);
    const session = await this.auth.requireSession(sessionCookie(req));
    return { id: session.id, userId: session.userId, email: session.user.email, pendingInvitationId: session.pendingInvitationId };
  }

  @Get('companies/:companyId/connections')
  async list(@Req() req: Request, @Param('companyId') companyId: string, @Query() query: unknown) {
    return this.connections.list(await this.actor(req), parseInput(id, companyId), parseInput(pagination, query));
  }

  @Post('companies/:companyId/connections')
  async connect(@Req() req: Request, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.connections.connect(await this.actor(req), parseInput(id, companyId), parseInput(connectProvider, body));
  }

  @Post('companies/:companyId/connections/:connectionId/reconnect')
  @HttpCode(200)
  async reconnect(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string, @Body() body: unknown,
  ) {
    return this.connections.reconnect(await this.actor(req), parseInput(id, companyId),
      parseInput(id, connectionId), parseInput(reconnectProvider, body).credentials);
  }

  @Post('companies/:companyId/connections/:connectionId/disconnect')
  @HttpCode(200)
  async disconnect(@Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string) {
    return this.connections.disconnect(await this.actor(req), parseInput(id, companyId), parseInput(id, connectionId));
  }

  @Get('companies/:companyId/connections/:connectionId/mappings')
  async mappings(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string, @Query() query: unknown,
  ) {
    return this.connections.mappings(await this.actor(req), parseInput(id, companyId),
      parseInput(id, connectionId), parseInput(pagination, query));
  }

  @Put('companies/:companyId/connections/:connectionId/mappings')
  async setMappings(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string, @Body() body: unknown,
  ) {
    return this.connections.setMappings(await this.actor(req), parseInput(id, companyId),
      parseInput(id, connectionId), parseInput(setMappings, body));
  }

  @Get('companies/:companyId/connections/:connectionId/coverage')
  async coverage(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string, @Query() query: unknown,
  ) {
    return this.reconciliation.coverage(await this.actor(req), parseInput(id, companyId), parseInput(id, connectionId),
      parseInput(pagination, query));
  }

  @Post('companies/:companyId/connections/:connectionId/backfills')
  @HttpCode(202)
  async backfill(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('connectionId') connectionId: string, @Body() body: unknown,
  ) {
    return this.reconciliation.request(await this.actor(req), parseInput(id, companyId), parseInput(id, connectionId),
      parseInput(id, req.get('Idempotency-Key')), parseInput(backfillInput, body));
  }

  @Get('companies/:companyId/review')
  async review(@Req() req: Request, @Param('companyId') companyId: string, @Query() query: unknown) {
    return this.attribution.list(await this.actor(req), parseInput(id, companyId), parseInput(pagination, query));
  }

  @Post('companies/:companyId/review/:reviewId/resolve')
  @HttpCode(200)
  async resolve(
    @Req() req: Request, @Param('companyId') companyId: string, @Param('reviewId') reviewId: string, @Body() body: unknown,
  ) {
    return this.attribution.resolve(await this.actor(req), parseInput(id, companyId), parseInput(id, reviewId),
      parseInput(id, req.get('Idempotency-Key')), parseInput(resolveReview, body));
  }

  @Post('webhooks/:provider/:connectionId')
  @HttpCode(204)
  async receive(@Req() req: Request, @Param('provider') provider: string, @Param('connectionId') connectionId: string) {
    if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'INVALID_PROVIDER_EVENT', 'Send the raw JSON event body.');
    await this.inbox.receive(parseInput(providerName, provider), parseInput(id, connectionId), req.body, req.headers);
  }
}

@Module({
  imports: [AuthModule], providers: [Providers, Connections, Inbox, Attribution, Reconciliation], controllers: [IntegrationsController],
})
export class IntegrationsModule {}
