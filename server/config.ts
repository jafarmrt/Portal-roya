import 'dotenv/config';
import path from 'path';
import packageJson from '../package.json';

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

// Active Directory / LDAP sign-in is on when LDAP_URL is set. Local portal accounts keep working alongside it.
const ldap = process.env.LDAP_URL
  ? {
      url: process.env.LDAP_URL,
      // Read-only service account used to look users up. Without it, the user's own
      // credentials (username@LDAP_DOMAIN) are used for the lookup.
      bindDn: process.env.LDAP_BIND_DN || '',
      bindPassword: process.env.LDAP_BIND_PASSWORD || '',
      domain: process.env.LDAP_DOMAIN || '',
      baseDn: required('LDAP_BASE_DN', ''),
      userFilter: process.env.LDAP_USER_FILTER || '(&(objectCategory=person)(objectClass=user)(sAMAccountName={{username}}))',
      // Optional group DNs (nested membership counts).
      allowedGroup: process.env.LDAP_ALLOWED_GROUP || '',
      adminGroup: process.env.LDAP_ADMIN_GROUP || '',
      startTls: process.env.LDAP_STARTTLS === 'true',
      caFile: process.env.LDAP_CA_FILE || '',
      tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
      timeoutMs: Number(process.env.LDAP_TIMEOUT_MS || 8000),
    }
  : null;
if (ldap && !ldap.bindDn && !ldap.domain) {
  throw new Error('برای ورود با اکتیو دایرکتوری یکی از LDAP_BIND_DN یا LDAP_DOMAIN را تنظیم کنید.');
}

export const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl,
  sessionSecret,
  // A session is renewed while it is used, so this is how long a colleague stays signed in without opening the portal.
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  // Set to true only when the portal is served over HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Company addresses that internet visitors arrive from, e.g. a router that rewrites their source
  // address to its own (192.168.0.100). Comma-separated addresses or ranges (192.168.5.0/24).
  outsideAddresses: (process.env.OUTSIDE_ADDRESSES || '').split(',').map((a) => a.trim()).filter(Boolean),
  version: packageJson.version,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  // Nightly backups; next to the uploads folder unless set (e.g. a mounted network share).
  backupDir: path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(path.resolve(process.env.UPLOAD_DIR || 'uploads')), 'backups')),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  ldap,
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
