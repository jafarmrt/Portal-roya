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
      // No --enable-source-maps: it loads the 13 MB map at start and keeps it, about 200 MB of the
      // 400 MB the portal had; under PM2's limit that meant restarts every half minute with 50 people
      // online. An error's stack then names lines of server-dist/index.cjs; to read it in TypeScript,
      // run once with NODE_OPTIONS=--enable-source-maps.
      // PM2 itself turns source maps on in the process it starts, unless told not to (another ~150 MB).
      disable_source_map_support: true,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tehran',
        DOTENV_CONFIG_PATH: path.join(home, '.env'),
        DOTENV_CONFIG_QUIET: 'true',
        UPLOAD_DIR: path.join(home, 'uploads'),
      },
      // Restarted only if something really runs away. The server has 2 GB with PostgreSQL beside it.
      max_memory_restart: '700M',
    },
  ],
};
