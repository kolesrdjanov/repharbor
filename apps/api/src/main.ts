import 'reflect-metadata';
import { health } from '@repharbor/contracts';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mountApiDocs } from './api-docs';
import { AuthModule } from './auth/auth.controller';
import { ApiError, assignRequestId, HttpErrorFilter } from './http';
import { readConfiguration } from './config';
import { Database, DatabaseModule } from './database';

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check() {
    if (!await this.database.isReady()) {
      throw new ApiError(503, 'UNAVAILABLE', 'The database is unavailable.');
    }
    return health.parse({ status: 'ok' });
  }
}

@Module({ imports: [DatabaseModule, AuthModule], controllers: [HealthController] })
class ApiModule {}

async function bootstrap() {
  const config = readConfiguration();
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, { rawBody: true });
  app.enableShutdownHooks();
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(assignRequestId);
  app.useGlobalFilters(new HttpErrorFilter());
  if (config.NODE_ENV === 'development' || config.API_DOCS_ENABLED === 'true') mountApiDocs(app);
  app.enableCors({ origin: config.APP_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.listen(config.PORT, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
