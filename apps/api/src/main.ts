import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { readConfiguration } from './config';
import { Database, DatabaseModule } from './database';

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check() {
    if (!await this.database.isReady()) {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ok' };
  }
}

@Module({ imports: [DatabaseModule], controllers: [HealthController] })
class ApiModule {}

async function bootstrap() {
  const config = readConfiguration();
  const app = await NestFactory.create(ApiModule, { rawBody: true });
  app.enableShutdownHooks();
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Request-ID', randomUUID());
    next();
  });
  app.enableCors({ origin: config.APP_ORIGIN, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  await app.listen(config.PORT, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
