import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';
import { readConfiguration } from './config';
import { IngestionWorker } from './integrations/ingestion-worker';
import { ReconciliationWorker } from './integrations/reconciliation';
import { Providers } from './integrations/providers';
import { LoginMailWorker } from './auth/login-mail';
import { Database, DatabaseModule } from './database';

@Module({ imports: [DatabaseModule], providers: [LoginMailWorker, Providers, IngestionWorker, ReconciliationWorker] })
class WorkerModule {}

async function bootstrap() {
  const config = readConfiguration();
  const context = await NestFactory.createApplicationContext(WorkerModule);
  const database = context.get(Database);
  const health = createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const ready = await database.isReady();
    response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: ready ? 'ok' : 'unavailable' }));
  });
  health.once('error', async (error) => {
    Logger.error(error.message, 'Worker');
    await context.close();
    process.exitCode = 1;
  });
  health.listen(config.WORKER_HEALTH_PORT, config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => {
    Logger.log(`Readiness listening on port ${config.WORKER_HEALTH_PORT}`, 'Worker');
  });
  const shutdown = () => health.close(() => void context.close());
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
