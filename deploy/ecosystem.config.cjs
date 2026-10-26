// PM2 process file for running the portal without Docker.
//
// Release install (deploy/update.sh): this file sits in <home>/releases/<tag>/deploy/,
// and the app runs from <home>/current with <home>/.env and <home>/uploads.
// Source checkout: the app runs from the repository root with its own .env.
const path = require('path');

const releaseDir = path.resolve(__dirname, '..');
const isRelease = path.basename(path.dirname(releaseDir)) === 'releases';
const home = isRelease ? path.resolve(releaseDir, '../..') : releaseDir;

module.exports = {
  apps: [
    {
      name: 'roya-portal',
      cwd: isRelease ? path.join(home, 'current') : releaseDir,
      script: 'server-dist/index.cjs',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tehran',
        DOTENV_CONFIG_PATH: path.join(home, '.env'),
        DOTENV_CONFIG_QUIET: 'true',
        UPLOAD_DIR: path.join(home, 'uploads'),
      },
      max_memory_restart: '400M',
    },
  ],
};
