import express from 'express';
import path from 'path';
import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { reconcileDepartments, reconcileLocations } from './departments.js';
import { describeDirectoryUser } from './ldap.js';
import { isMailEnabled } from './mailer.js';
import { ensureRoles } from './roles.js';
import { startScheduler } from './scheduler.js';
import { startPresenceSweep } from './presence.js';

// A promise that fails outside a request (a timer, a background job) is logged instead of stopping
// the portal for everyone; request errors already reach the error handler.
process.on('unhandledRejection', (err) => console.error('Unhandled error:', err));

const NO_CACHE_FILES = new Set(['sw.js', 'manifest.webmanifest', 'offline.html', 'appearance.js']);

async function main() {
  await runMigrations();
  await ensureRoles();
  // Brings departments typed before the list was enforced into the list; a failure must not keep the portal down.
  try {
    const departments = await reconcileDepartments();
    if (departments.added.length > 0) console.log(`Departments added to the list from existing data: ${departments.added.join(', ')}`);
    for (const r of departments.renamed) console.log(`Department "${r.from}" now written as "${r.to}"`);
  } catch (err) {
    console.error('Could not reconcile departments:', err);
  }
  // The same for the locations colleagues typed in their profiles before the list existed.
  try {
    const locations = await reconcileLocations();
    if (locations.added.length > 0) console.log(`Locations added to the list from existing data: ${locations.added.join(', ')}`);
    for (const r of locations.renamed) console.log(`Location "${r.from}" now written as "${r.to}"`);
  } catch (err) {
    console.error('Could not reconcile locations:', err);
  }
  const app = createApp();

  if (config.isProduction) {
    const distPath = path.resolve('dist');
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '7d',
        immutable: true,
        // Files without a hash in their name that installed apps check for changes: the service worker,
        // the app manifest and the offline page must never come from a week-old copy.
        setHeaders: (res, filePath) => {
          if (NO_CACHE_FILES.has(path.basename(filePath))) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
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
  startPresenceSweep();
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
