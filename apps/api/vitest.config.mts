import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS dependency injection reads `design:paramtypes`, which esbuild — the
 * default Vitest transformer — does not emit. The SWC plugin does, so the whole
 * repository can share one test runner instead of adding Jest for the API.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globals: false,
    /*
     * Configuration is validated at import time, so any module that reaches the
     * env has to find a valid one. These are deliberately obvious placeholders:
     * nothing here is a real credential, and no test may depend on the values.
     */
    env: {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:4000',
      MONGODB_URI: 'mongodb://localhost:27017/siteops_test',
      AUTH_SECRET: 'test-only-secret-value-not-used-for-anything-real',
    },
  },
});
