import { Injectable } from '@nestjs/common';
import type { Connection } from '@prisma/client';
import { providerCredentials, providerEnvironment, providerName } from '@repharbor/contracts';
import { seal, unseal } from '../auth/secrets';
import { readConfiguration } from '../config';
import type { Credentials, Provider, ProviderAdapter, Source } from './provider';
import { DodoAdapter } from './providers/dodo';
import { WhopAdapter } from './providers/whop';
import { RevenueCatAdapter } from './providers/revenuecat';
import { StripeAdapter } from './providers/stripe';

@Injectable()
export class Providers {
  private readonly config = readConfiguration();
  private readonly key = Buffer.from(this.config.SECRET_ENCRYPTION_KEY, 'base64');
  private readonly local = this.config.ALLOW_LOCAL_PROVIDER_FIXTURES === 'true';
  private readonly adapters: Record<Provider, ProviderAdapter> = {
    stripe: new StripeAdapter(this.local), dodo: new DodoAdapter(this.local),
    whop: new WhopAdapter(this.local), revenuecat: new RevenueCatAdapter(this.local),
  };

  forProvider(name: Provider) {
    return this.adapters[name];
  }

  source(row: Connection): Source {
    return {
      id: row.id, companyId: row.companyId,
      provider: providerName.parse(row.provider), environment: providerEnvironment.parse(row.environment),
      externalAccount: row.externalAccount,
      credentials: providerCredentials.parse(JSON.parse(unseal(row.secretRef, this.key))),
    };
  }

  encrypt(credentials: Credentials) {
    return seal(JSON.stringify(credentials), this.key);
  }
}
