import { execSync } from 'node:child_process';

/** Brings the test database to the latest migration (each suite reseeds in createApp). */
export default async function globalSetup() {
  require('./env');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
