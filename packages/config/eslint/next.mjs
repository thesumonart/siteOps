import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/** Flat config for the Next.js App Router frontend. */
export const nextConfig = tseslint.config(
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,

      // Pages Router only. This project is App Router exclusively, and the rule
      // emits a warning about a missing `pages/` directory whenever ESLint is
      // invoked from the repository root, such as from lint-staged.
      '@next/next/no-html-link-for-pages': 'off',

      // Server secrets must never be reachable from a client bundle. Only
      // NEXT_PUBLIC_* is legitimate in the browser, and that is enforced by the
      // typed env module rather than ad-hoc process.env reads.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Import from `@/lib/env` instead of reading process.env directly.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message: 'Use the `@/` path alias instead of deep relative imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // The env module is where NEXT_PUBLIC_* values are read and validated.
    // Everything downstream imports the validated object instead.
    files: ['**/lib/env.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    /*
     * The end-to-end harness starts the servers it tests, so it is the thing
     * that *supplies* the environment rather than a consumer of the validated
     * one — the same position `env.ts` occupies. It also runs in Node, outside
     * the bundle, so the `@/` alias the rule points at does not resolve there.
     */
    files: ['**/playwright.config.ts', '**/e2e/**/*.ts', '**/next.config.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
);

export default nextConfig;
