// Creates the databases and a least-privilege app user, then writes the
// connection strings into .env. Run once: `npm run db:setup`.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

// ENV_FILE lets you point the script at another env file (e.g. a throwaway test instance)
const ENV_PATH = process.env.ENV_FILE ? pathToFileURL(resolve(process.env.ENV_FILE)) : new URL('../.env', import.meta.url);
const raw = readFileSync(ENV_PATH, 'utf8');
const env = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')];
    }),
);

const host = env.MYSQL_HOST || 'localhost';
const port = Number(env.MYSQL_PORT || 3306);
const rootUser = env.MYSQL_ROOT_USER || 'root';
const rootPassword = env.MYSQL_ROOT_PASSWORD ?? '';

if (!rootPassword) {
  console.error('✖ MYSQL_ROOT_PASSWORD is empty in backend/.env — fill it in and run again.');
  process.exit(1);
}

const DBS = { main: 'b2b_bozor', test: 'b2b_bozor_test', shadow: 'b2b_bozor_shadow' };
const APP_USER = 'b2b_app';
const appPassword = randomBytes(18).toString('base64url');

let conn;
try {
  conn = await mysql.createConnection({ host, port, user: rootUser, password: rootPassword });
} catch (err) {
  console.error(`✖ Could not connect to MySQL at ${host}:${port} as ${rootUser}: ${err.message}`);
  process.exit(1);
}

for (const db of Object.values(DBS)) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`✔ database ${db}`);
}

// Same user for localhost and 127.0.0.1 (MySQL treats them as different hosts)
for (const h of ['localhost', '127.0.0.1']) {
  await conn.query(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [APP_USER, h, appPassword]);
  await conn.query(`ALTER USER ?@? IDENTIFIED BY ?`, [APP_USER, h, appPassword]);
  for (const db of Object.values(DBS)) {
    await conn.query(`GRANT ALL PRIVILEGES ON \`${db}\`.* TO ?@?`, [APP_USER, h]);
  }
}
await conn.query('FLUSH PRIVILEGES');
await conn.end();
console.log(`✔ user ${APP_USER} (access limited to the three databases above)`);

const url = (db) => `mysql://${APP_USER}:${encodeURIComponent(appPassword)}@${host}:${port}/${db}`;
const updates = {
  DATABASE_URL: url(DBS.main),
  TEST_DATABASE_URL: url(DBS.test),
  SHADOW_DATABASE_URL: url(DBS.shadow),
  // the root password is no longer needed — don't keep it lying around
  MYSQL_ROOT_PASSWORD: '',
};

let next = raw;
for (const [k, v] of Object.entries(updates)) {
  const line = `${k}=${v}`;
  next = new RegExp(`^${k}=.*$`, 'm').test(next) ? next.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${next.trimEnd()}\n${line}\n`;
}
writeFileSync(ENV_PATH, next);
console.log('✔ .env updated (DATABASE_URL, TEST_DATABASE_URL, SHADOW_DATABASE_URL); MYSQL_ROOT_PASSWORD cleared');
console.log('\nNext: npm run db:migrate && npm run db:seed');
