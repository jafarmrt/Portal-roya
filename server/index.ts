import express from 'express';
import path from 'path';
import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { describeDirectoryUser } from './ldap.js';
import { isMailEnabled } from './mailer.js';
import { ensureRoles } from './roles.js';
import { startScheduler } from './scheduler.js';

async function main() {
  await runMigrations();
  await ensureRoles();
  const app = createApp();

  if (config.isProduction) {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath, { index: false, maxAge: '7d', immutable: true }));
    // A missing file (e.g. a code chunk from the previous release requested by a page opened before
    // an update) must be a real 404: answering with index.html makes the browser fail to run it.
    app.get(/\.[a-z0-9]+$/i, (_req, res) => {
      res.status(404).end();
    });
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  startScheduler();
  app.listen(config.port, config.host, () => {
    console.log(`Portal running on http://${config.host}:${config.port}`);
    console.log(`E-mail notifications: ${isMailEnabled() ? 'enabled' : 'disabled (SMTP_HOST not set)'}`);
  });
}

/** `node server-dist/index.cjs ldap-test <username>` checks the AD settings in .env without starting the portal. */
async function ldapTest(username: string | undefined) {
  if (!username) throw new Error('Usage: ldap-test <username>');
  console.log(JSON.stringify(await describeDirectoryUser(username), null, 2));
}

if (process.argv[2] === 'ldap-test') {
  ldapTest(process.argv[3]).then(
    () => process.exit(0),
    (err) => {
      console.error('LDAP test failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
} else {
  main().catch((err) => {
    console.error('Failed to start the portal:', err);
    process.exit(1);
  });
}
