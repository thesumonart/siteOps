import globals from 'globals';

import { baseConfig } from './eslint/base.mjs';

/**
 * Lints this package's own flat-config modules. They are plain ESM run by
 * ESLint under Node, so they need Node globals without type-aware rules.
 */
export default [
  ...baseConfig,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
