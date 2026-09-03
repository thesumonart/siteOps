import { nextConfig } from '@siteops/config/eslint/next';

export default [
  ...nextConfig,
  {
    // `.next-e2e` is the end-to-end suite's build output; see next.config.ts.
    ignores: ['.next/**', '.next-e2e/**', 'next-env.d.ts'],
  },
];
