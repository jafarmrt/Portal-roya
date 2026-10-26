// PM2 process file for running the portal without Docker.
// Usage (from the repository root): pm2 start deploy/ecosystem.config.cjs
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'roya-portal',
      cwd: path.resolve(__dirname, '..'),
      script: 'server-dist/index.mjs',
      node_args: '--enable-source-maps',
      env: { NODE_ENV: 'production', TZ: 'Asia/Tehran' },
      max_memory_restart: '400M',
    },
  ],
};
