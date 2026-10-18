// Shared ESLint flat config preset.
// Use in a workspace: `export default baseConfig();` from `eslint.config.mjs`.
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { boundariesConfig } from './boundaries.mjs';

export {
  MODULE_GRAPH,
  REPO_ROOT,
  SHARED_MODULE,
  allowedModuleImports,
  reachableModules,
} from './boundaries.mjs';

const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];

const ORM_IMPORTS = ['drizzle-orm', 'drizzle-orm/*', 'postgres', '@electric-sql/*'];
const FRAMEWORK_IMPORTS = ['@nestjs/*', 'nestjs-*', 'express', 'react', 'react-dom', 'rxjs'];
const IO_IMPORTS = [
  '@supabase/*',
  'child_process',
  'fs',
  'fs/*',
  'http',
  'https',
  'net',
  'node:*',
  'pino',
];
const DOMAIN_FORBIDDEN_IMPORTS = [...ORM_IMPORTS, ...FRAMEWORK_IMPORTS, ...IO_IMPORTS];

function restrictImports(files, patterns, message) {
  return {
    name: `mini-market/restrict-imports (${files.join(', ')})`,
    files,
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }] },
  };
}

/**
 * @param {{ rootPath?: string }} [options] rootPath: base of the boundary element patterns.
 *   Defaults to the repository root; only tests override it.
 * @returns {import('eslint').Linter.Config[]}
 */
export function baseConfig(options = {}) {
  return [
    {
      name: 'mini-market/ignores',
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.turbo/**',
        '**/drizzle/**',
        '**/__fixtures__/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strict.map((config) => ({
      ...config,
      files: config.files ?? TS_FILES,
    })),
    {
      name: 'mini-market/typescript',
      files: TS_FILES,
      rules: {
        // docs/04-coding-standards.md section 1
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/consistent-type-imports': ['error'],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    {
      name: 'mini-market/imports',
      plugins: { 'import-x': importX },
      rules: {
        'import-x/no-duplicates': 'error',
        'import-x/no-self-import': 'error',
        // docs/04-coding-standards.md section 1: no default exports unless a framework requires them
        'import-x/no-default-export': 'error',
      },
    },
    {
      name: 'mini-market/config-files',
      files: ['**/*.config.{js,mjs,cjs,ts,mts,cts}', '**/*.d.ts'],
      rules: { 'import-x/no-default-export': 'off' },
    },
    {
      name: 'mini-market/globals',
      languageOptions: { globals: { ...globals.node, ...globals.es2023 } },
    },
    restrictImports(
      ['**/src/modules/*/domain/**'],
      DOMAIN_FORBIDDEN_IMPORTS,
      'domain/ is pure TypeScript: no framework, ORM, IO (docs/02-architecture.md section 5).',
    ),
    restrictImports(
      ['**/src/modules/*/application/**'],
      [...ORM_IMPORTS, '@nestjs/*', 'nestjs-*', 'react', 'react-dom'],
      'Use cases are plain functions over ports: no ORM, Nest or React (docs/04-coding-standards.md).',
    ),
    restrictImports(
      ['**/src/modules/*/presentation/**'],
      ORM_IMPORTS,
      'Controllers never import the ORM (docs/04-coding-standards.md section 4).',
    ),
    boundariesConfig(options),
  ];
}
