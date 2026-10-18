// Creates the folder convention of docs/02-architecture.md section 5 for a new API module:
//   pnpm nest:module <name>      (name in kebab-case, for example `sales` or `credit-sales`)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_MODULES_DIR = path.resolve(__dirname, '../src/modules');
const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'];

export class CreateModuleError extends Error {}

export const USAGE =
  'Usage: pnpm nest:module <name>   (kebab-case, for example: sales, credit-sales)';

const pascalCase = (name: string): string =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** @returns the files it created, relative to the module folder */
export function createModule(options: { name: string; modulesDir?: string }): string[] {
  const { name, modulesDir = DEFAULT_MODULES_DIR } = options;
  if (!NAME_PATTERN.test(name)) {
    throw new CreateModuleError(`Invalid module name "${name}". ${USAGE}`);
  }
  const moduleDir = path.join(modulesDir, name);
  if (existsSync(moduleDir)) {
    throw new CreateModuleError(`Module "${name}" already exists at ${moduleDir}`);
  }
  const className = `${pascalCase(name)}Module`;
  const files: Record<string, string> = {
    'domain/.gitkeep': '',
    'application/.gitkeep': '',
    'presentation/.gitkeep': '',
    'infrastructure/schema.ts': `// Drizzle tables of the ${name} module. Re-export this file from\n// src/infrastructure/db/schema.ts (one \`export *\` line per module, sorted alphabetically).\nexport {};\n`,
    [`${name}.module.ts`]: `import { Module } from '@nestjs/common';\n\n@Module({})\nexport class ${className} {}\n`,
    'index.ts': `export { ${className} } from './${name}.module';\n`,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(moduleDir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  for (const layer of LAYERS) {
    mkdirSync(path.join(moduleDir, layer), { recursive: true });
  }
  return Object.keys(files);
}

function main(argv: string[]): number {
  const [name] = argv;
  if (!name) {
    console.error(USAGE);
    return 1;
  }
  try {
    createModule({ name });
  } catch (error) {
    if (error instanceof CreateModuleError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
  console.log(`Created src/modules/${name}. Next:`);
  console.log(
    `  1. add the import and the entry for ${pascalCase(name)}Module to src/app.modules.ts (sorted)`,
  );
  console.log(
    `  2. add \`export * from '../../modules/${name}/infrastructure/schema';\` to src/infrastructure/db/schema.ts`,
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
