import { nodeConfig } from '@siteops/config/eslint/node';

export default [
  ...nodeConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS modules are legitimately empty classes carrying only decorator
      // metadata, and lifecycle hooks are often intentionally no-ops.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
