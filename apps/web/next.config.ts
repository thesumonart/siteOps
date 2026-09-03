import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never set `ignoreBuildErrors: true`. Type errors are also caught by
  // `pnpm typecheck` in CI, but the build must refuse to produce output from
  // code that does not compile. Next 16 no longer runs ESLint during builds;
  // linting is a separate CI step.
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
  transpilePackages: ['@siteops/shared'],
  // Returns a resolved promise rather than being `async`: Next requires a
  // Promise here, but there is nothing to await.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
