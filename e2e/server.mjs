// Starts the built portal against an empty database for the browser smoke tests.
import { spawn } from 'node:child_process';
import pg from 'pg';

const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/portal_e2e';

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query('drop schema if exists drizzle cascade; drop schema public cascade; create schema public;');
await client.end();

const server = spawn(process.execPath, ['--enable-source-maps', 'server-dist/index.cjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'e2e-session-secret-that-is-long-enough-0123456789',
    HOST: '127.0.0.1',
    PORT: process.env.E2E_PORT ?? '4173',
    UPLOAD_DIR: 'e2e/.uploads',
    SMTP_HOST: '',
    LDAP_URL: '',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
