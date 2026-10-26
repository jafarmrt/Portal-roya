import 'dotenv/config';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (!isProduction && devFallback !== undefined) return devFallback;
  throw new Error(`متغیر محیطی ${name} تنظیم نشده است.`);
}

const databaseUrl = isTest
  ? required('TEST_DATABASE_URL', 'postgresql://portal:portal@localhost:5432/portal_test')
  : required('DATABASE_URL', 'postgresql://portal:portal@localhost:5432/portal');

const sessionSecret = required('SESSION_SECRET', 'dev-only-secret-change-me');
if (isProduction && sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET باید حداقل ۳۲ کاراکتر باشد.');
}

export const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl,
  sessionSecret,
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  // Set to true only when the portal is served over HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 25),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASSWORD || undefined,
        from: process.env.SMTP_FROM || 'portal@localhost',
      }
    : null,
};
