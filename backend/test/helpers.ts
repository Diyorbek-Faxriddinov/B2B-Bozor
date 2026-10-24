import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { loadEnv } from '../src/config/env';

/** Fresh app over freshly seeded data, so suites don't depend on each other. */
export async function createApp(): Promise<INestApplication> {
  loadEnv();
  const { seed } = await import('../prisma/seed');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await seed(prisma);
  await prisma.$disconnect();
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/main');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  await configureApp(app);
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());

export async function login(app: INestApplication, email: string, password = 'demo1234') {
  const res = await api(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const TASHKENT_ADDRESS = { label: 'Test', text: "Toshkent, Chilonzor tumani, 9-kvartal", lat: 41.2795, lng: 69.1932 };
