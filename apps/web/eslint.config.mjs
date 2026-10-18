import { baseConfig } from '@mini-market/config/eslint';
import globals from 'globals';

export default [
  ...baseConfig(),
  { name: 'web/ignores', ignores: ['**/*.gen.ts'] },
  {
    name: 'web/browser-globals',
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    name: 'web/scripts',
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
