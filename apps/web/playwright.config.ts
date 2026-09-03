import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real stack: a real Next.js server, a real
 * NestJS API and a real MongoDB. Nothing is stubbed, because what these tests
 * are for is the seams between those processes — session cookies crossing an
 * origin, the organization header, the error envelope reaching a rendered
 * message. A mocked API would test none of that.
 *
 * They deliberately do **not** cover the monitoring worker. A check runs
 * against a website on a schedule measured in minutes; asserting on that from a
 * browser test would either be slow and flaky or would need faked check data,
 * and the worker already has integration tests against a real database.
 */

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);

const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
const API_URL = `http://localhost:${String(API_PORT)}`;

/**
 * A database of its own, never the development one. These tests create and
 * delete users and organizations, and a suite that can damage the data someone
 * is developing against is a suite people stop running.
 *
 * `localhost`, not `127.0.0.1`, to match `docker-compose.yml` and every other
 * config in the repository. The two are not interchangeable on Windows: the
 * container publishes its port on the address `localhost` resolves to, and a
 * separately installed MongoDB can be listening on the other one. Pointing
 * this suite at the wrong instance is not a connection error — it silently
 * creates and drops databases somewhere nobody is looking.
 */
export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ??
  'mongodb://localhost:27017/siteops_e2e?replicaSet=rs0&directConnection=true';

/**
 * Not a secret. This database is disposable and the value never leaves the
 * machine running the suite; a real deployment supplies its own. The tests
 * need it because the email-verification link carries a token signed with it,
 * and there is no mail provider in a test run to deliver that link.
 */
export const E2E_AUTH_SECRET = 'e2e-only-auth-secret-value-not-used-anywhere-else';

export const E2E_API_URL = API_URL;

const apiEnv = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  APP_URL: WEB_URL,
  API_URL,
  MONGODB_URI: E2E_MONGODB_URI,
  MONGODB_AUTO_INDEX: 'true',
  AUTH_SECRET: E2E_AUTH_SECRET,
  LOG_LEVEL: 'warn',
  // Sign-in is attempted repeatedly across these tests; the production budget
  // would start rejecting them partway through and the failure would look like
  // a bug in the app rather than in the test setup.
  AUTH_RATE_LIMIT_MAX_REQUESTS: '1000',
  RATE_LIMIT_MAX_REQUESTS: '5000',
};

export default defineConfig({
  testDir: './e2e',
  // Each spec creates its own account, so files are independent — but they
  // share one API process, and running them serially keeps a failure's logs
  // readable rather than interleaved across workers.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_URL,
    // Kept only for a failing test: a trace for every passing run is a lot of
    // disk for something nobody opens.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /*
   * Both servers run the built output rather than a dev server: a dev build
   * has different error handling and no production bundling, so a test passing
   * against it says less than it appears to.
   */
  webServer: [
    {
      command: 'node --enable-source-maps ../api/dist/main.js',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: apiEnv,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      /*
       * Built here rather than reusing `pnpm build`, because `NEXT_PUBLIC_*`
       * values are inlined into the bundle: a build made against the
       * development API URL would send the browser to the wrong port, and the
       * failure would surface as "could not reach the server" rather than as a
       * misconfiguration. `NEXT_DIST_DIR` keeps it out of the normal build.
       */
      command: `pnpm exec next build && pnpm exec next start --port ${String(WEB_PORT)}`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_APP_URL: WEB_URL,
        API_URL,
        APP_URL: WEB_URL,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
