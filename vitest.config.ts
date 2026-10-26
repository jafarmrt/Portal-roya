import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Tests share one database, so files run one after another.
    fileParallelism: false,
    env: { NODE_ENV: 'test', TZ: 'Asia/Tehran' },
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
