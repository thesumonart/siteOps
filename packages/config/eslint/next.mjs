import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/** Flat config for the Next.js App Router frontend. */
export const nextConfig = tseslint.config(...baseConfig, {
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
});

export default nextConfig;
