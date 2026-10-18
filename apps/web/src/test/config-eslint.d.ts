// @mini-market/config ships plain .mjs presets without type declarations.
declare module '@mini-market/config/eslint' {
  import type { Linter } from 'eslint';

  export function baseConfig(options?: { rootPath?: string }): Linter.Config[];
}
