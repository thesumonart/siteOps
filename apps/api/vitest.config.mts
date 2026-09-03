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
  },
});
