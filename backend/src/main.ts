import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'node:fs';
import { env, loadEnv, uploadRoot } from './config/env';

/** Shared HTTP setup — used by main() and by the e2e tests. */
export async function configureApp(app: INestApplication) {
  const e = env();
  const http = app as NestExpressApplication;

  http.set('trust proxy', 'loopback');
  http.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true, maxAge: 86400 });
  http.useBodyParser('json', { limit: '1mb' });
  http.useBodyParser('urlencoded', { extended: false, limit: '256kb' });

  mkdirSync(uploadRoot(), { recursive: true });
  app.use('/uploads', express.static(uploadRoot(), { maxAge: '30d', immutable: true, index: false, fallthrough: false }));

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const e = loadEnv();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  await configureApp(app);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('B2B Bozor API').setVersion('1.0').setDescription('REST API v1 — contract: docs/API.md').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, doc);

  await app.listen(e.PORT);
  const log = new Logger('Bootstrap');
  log.log(`API     ${e.APP_URL}/api/v1`);
  log.log(`Docs    ${e.APP_URL}/api/docs`);
  log.log(`Health  ${e.APP_URL}/api/v1/health`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
