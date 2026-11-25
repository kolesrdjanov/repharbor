import { Injectable } from '@nestjs/common';
import type { Connection } from '@prisma/client';
import { providerCredentials, providerEnvironment, providerName } from '@repharbor/contracts';
import { seal, unseal } from '../auth/secrets';
import { readConfiguration } from '../config';
import { ApiError } from '../http';
import type { Credentials, Provider, ProviderAdapter, Source } from './provider';
import { StripeAdapter } from './providers/stripe';

@Injectable()
export class Providers {
  private readonly config = readConfiguration();
  private readonly key = Buffer.from(this.config.SECRET_ENCRYPTION_KEY, 'base64');
  private readonly adapters: Partial<Record<Provider, ProviderAdapter>> = {
    stripe: new StripeAdapter(this.config.ALLOW_LOCAL_PROVIDER_FIXTURES === 'true'),
  };

  forProvider(name: Provider) {
    const adapter = this.adapters[name];
    if (!adapter) throw new ApiError(422, 'PROVIDER_UNAVAILABLE', 'This provider is unavailable in this environment.');
    return adapter;
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
