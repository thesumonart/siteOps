import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
     * Configuration is validated at import time, so any module that reaches
     * `../config/env.js` needs a valid environment. Only the two fields with no
     * default (`MONGODB_URI`, `APP_URL`) are required here; everything else
     * falls back to the schema's own defaults.
     *
     * `MONGODB_URI` points at the same local replica set every other package
     * in this repo uses (`pnpm docker:up`), and is overridden by CI to the
     * MongoDB service container declared in `.github/workflows/ci.yml`.
     */
    env: {
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:3000',
      MONGODB_URI:
        process.env.MONGODB_URI ??
        'mongodb://localhost:27017/siteops_test?replicaSet=rs0&directConnection=true',
    },
    testTimeout: 20_000,
    /*
     * The incident/notification integration tests (see `test-support/test-db.ts`)
     * share one live MongoDB database rather than a per-file mock, and their
     * cleanup step wipes entire collections between test cases. Running test
     * files in parallel — Vitest's default — lets one file's cleanup delete
     * documents another file is still asserting on. Everything else in this
     * package is a pure or mocked unit test with no such shared state, so this
     * only costs a little wall-clock time, not correctness.
     */
    fileParallelism: false,
  },
});
