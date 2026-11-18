import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/**
 * Every build of the page gets a name of its own. It is written into the page's code (`__BUILD_ID__`)
 * and next to it as dist/build-id.json, which the server reads and tells every open page. A page whose
 * own name differs from the server's was opened before an update, and offers to refresh itself
 * (src/lib/appUpdate.ts). The development server has no build, so there the name is empty and nothing is compared.
 */
function buildId(): Plugin {
  let id = '';
  return {
    name: 'roya-build-id',
    config(_config, { command }) {
      if (command === 'build') id = process.env.BUILD_ID || `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
      return { define: { __BUILD_ID__: JSON.stringify(id) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-id.json', source: `${JSON.stringify({ id })}\n` });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildId()],
  build: {
    chunkSizeWarningLimit: 700,
  },
});
