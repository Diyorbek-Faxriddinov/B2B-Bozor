/** Test environment: separate database, no external services. */
import { existsSync } from 'node:fs';

const file = process.env.ENV_FILE ?? '.env';
if (existsSync(file)) process.loadEnvFile(file);

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is empty — run `npm run db:setup` first');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.OSRM_URL = 'off'; // deterministic straight-line routes
process.env.ANTHROPIC_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.ESKIZ_EMAIL = '';
process.env.PAYME_MERCHANT_ID = '';
process.env.CLICK_SERVICE_ID = '';
process.env.UPLOAD_DIR = 'uploads-test';
