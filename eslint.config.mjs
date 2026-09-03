import { baseConfig } from './packages/config/eslint/base.mjs';

/**
 * Fallback config for files at the repository root. Each app and package ships
 * its own `eslint.config.mjs`; ESLint resolves the nearest one to the file
 * being linted, so this only ever applies to root-level scripts.
 */
export default baseConfig;
