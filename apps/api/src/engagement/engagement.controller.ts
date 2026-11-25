import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  acceptAgreement, acceptInvitation, createCompany, createProduct, decideClaim, id, invitationReference,
  inviteFounder, inviteRep, pagination, proposeAgreement, registerClaim,
} from '@repharbor/contracts';
import { AuthModule, checkOrigin, sessionCookie } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { readConfiguration } from '../config';
import { parseInput } from '../http';
import { EngagementService } from './engagement.service';
import { InvitationService } from './invitation.service';

@Controller()
class EngagementController {
  private readonly origin = readConfiguration().APP_ORIGIN;

  constructor(
    private readonly auth: AuthService,
    private readonly engagement: EngagementService,
    private readonly invitation: InvitationService,
  ) {}

  private async actor(request: Request) {
    if (request.method === 'POST') checkOrigin(request, this.origin);
    const current = await this.auth.requireSession(sessionCookie(request));
    return { id: current.id, userId: current.userId, email: current.user.email, pendingInvitationId: current.pendingInvitationId };
  }

  @Post('companies')
  async createCompany(@Req() req: Request, @Body() body: unknown) {
    return this.engagement.createCompany(await this.actor(req), parseInput(createCompany, body));
  }

  @Get('companies/:companyId/products')
  async listProducts(@Req() req: Request, @Param('companyId') companyId: string, @Query() query: unknown) {
    return this.engagement.listProducts(await this.actor(req), parseInput(id, companyId), parseInput(pagination, query));
  }

  @Post('companies/:companyId/products')
  async createProduct(@Req() req: Request, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.engagement.createProduct(await this.actor(req), parseInput(id, companyId), parseInput(createProduct, body));
  }

  @Post('companies/:companyId/invitations')
  async inviteRep(@Req() req: Request, @Param('companyId') companyId: string, @Body() body: unknown) {
    return this.invitation.inviteRep(await this.actor(req), parseInput(id, companyId),
      parseInput(id, req.get('Idempotency-Key')), parseInput(inviteRep, body));
  }

  @Post('portfolio/invitations')
  async inviteFounder(@Req() req: Request, @Body() body: unknown) {
    return this.invitation.inviteFounder(await this.actor(req),
      parseInput(id, req.get('Idempotency-Key')), parseInput(inviteFounder, body));
  }

  @Post('invitations/preview')
  @HttpCode(200)
  async preview(@Req() req: Request, @Body() body: unknown) {
    return this.invitation.preview(await this.actor(req), parseInput(invitationReference, body));
  }

  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvite(@Req() req: Request, @Body() body: unknown) {
    return this.invitation.accept(await this.actor(req), parseInput(acceptInvitation, body));
  }

  @Post('invitations/:invitationId/revoke')
  @HttpCode(204)
  async revoke(@Req() req: Request, @Param('invitationId') invitationId: string) {
    await this.invitation.revoke(await this.actor(req), parseInput(id, invitationId));
  }

  @Get('companies/:companyId/engagements')
  async company(@Req() req: Request, @Param('companyId') companyId: string, @Query() query: unknown) {
    return this.engagement.dashboard(await this.actor(req), parseInput(id, companyId), parseInput(pagination, query));
  }

  @Get('portfolio/engagements')
  async portfolio(@Req() req: Request, @Query() query: unknown) {
    return this.engagement.dashboard(await this.actor(req), undefined, parseInput(pagination, query));
  }

  @Get('engagements/:engagementId')
  async read(@Req() req: Request, @Param('engagementId') engagementId: string) {
    return this.engagement.read(await this.actor(req), parseInput(id, engagementId));
  }

  @Get('engagements/:engagementId/agreements')
  async agreements(@Req() req: Request, @Param('engagementId') engagementId: string, @Query() query: unknown) {
    return this.engagement.agreements(await this.actor(req), parseInput(id, engagementId), parseInput(pagination, query));
  }

  @Post('engagements/:engagementId/agreements')
  async propose(@Req() req: Request, @Param('engagementId') engagementId: string, @Body() body: unknown) {
    return this.engagement.propose(await this.actor(req), parseInput(id, engagementId), parseInput(proposeAgreement, body));
  }

  @Post('engagements/:engagementId/agreements/:agreementId/accept')
  @HttpCode(200)
  async accept(
    @Req() req: Request, @Param('engagementId') engagementId: string, @Param('agreementId') agreementId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.accept(await this.actor(req), parseInput(id, engagementId),
      parseInput(id, agreementId), parseInput(acceptAgreement, body).revision);
  }

  @Post('engagements/:engagementId/close')
  @HttpCode(200)
  async close(@Req() req: Request, @Param('engagementId') engagementId: string) {
    return this.engagement.close(await this.actor(req), parseInput(id, engagementId));
  }

  @Get('engagements/:engagementId/claims')
  async claims(@Req() req: Request, @Param('engagementId') engagementId: string, @Query() query: unknown) {
    return this.engagement.claims(await this.actor(req), parseInput(id, engagementId), parseInput(pagination, query));
  }

  @Post('engagements/:engagementId/claims')
  async register(@Req() req: Request, @Param('engagementId') engagementId: string, @Body() body: unknown) {
    return this.engagement.register(await this.actor(req), parseInput(id, engagementId), parseInput(registerClaim, body));
  }

  @Post('engagements/:engagementId/claims/:claimId/decision')
  @HttpCode(200)
  async decide(
    @Req() req: Request, @Param('engagementId') engagementId: string, @Param('claimId') claimId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.decide(await this.actor(req), parseInput(id, engagementId),
      parseInput(id, claimId), parseInput(decideClaim, body));
  }
}

@Module({
  imports: [AuthModule], controllers: [EngagementController], providers: [EngagementService, InvitationService],
})
export class EngagementModule {}
