import express from 'express';
import path from 'path';
import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { isMailEnabled } from './mailer.js';
import { startScheduler } from './scheduler.js';

async function main() {
  await runMigrations();
  const app = createApp();

  if (config.isProduction) {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath, { index: false, maxAge: '7d', immutable: true }));
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

main().catch((err) => {
  console.error('Failed to start the portal:', err);
  process.exit(1);
});
