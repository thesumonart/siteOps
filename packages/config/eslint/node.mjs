import n from 'eslint-plugin-n';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/** Flat config for Node.js services — the NestJS API and the monitoring worker. */
export const nodeConfig = tseslint.config(...baseConfig, {
  languageOptions: {
    globals: { ...globals.node },
  },
  plugins: { n },
  rules: {
    // Catches `require`/import of packages that are not declared in package.json,
    // which is the most common way a monorepo service breaks in production.
    'n/no-extraneous-import': 'error',
    'n/no-process-exit': 'error',
    'n/no-sync': ['error', { allowAtRootLevel: true }],

    // Services must never read process.env directly; every value goes through
    // the validated env module so misconfiguration fails fast at startup.
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Import the validated `env` object instead of reading process.env directly.',
      },
    ],
  },
});

export default nodeConfig;
