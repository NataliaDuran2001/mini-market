// Architecture boundaries (docs/02-architecture.md sections 4 and 6, ADR 0009).
// Violations fail lint and therefore CI. Do not disable these rules.
//
// eslint-plugin-boundaries 7 renamed the `boundaries/element-types` rule to
// `boundaries/dependencies` (same semantics, new policy syntax). This preset uses the current
// name; the deprecated alias prints warnings on every lint run.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';

const require = createRequire(import.meta.url);

/** Repository root, three levels above packages/config/eslint. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Direct dependencies between API modules ("A -> B": A uses the public API of B).
 * Source of truth: docs/02-architecture.md section 4. Change it together with that document.
 */
export const MODULE_GRAPH = {
  access: ['tenancy'],
  audit: ['tenancy'],
  catalog: ['tenancy'],
  equity: ['tenancy'],
  health: [],
  inventory: ['catalog'],
  payables: ['tenancy'],
  purchasing: ['inventory', 'payables'],
  receivables: ['tenancy'],
  // reporting reads every module's exported schema and never writes (documented exception).
  reporting: [
    'access',
    'audit',
    'catalog',
    'equity',
    'inventory',
    'payables',
    'purchasing',
    'receivables',
    'sales',
    'tenancy',
  ],
  sales: ['catalog', 'inventory', 'receivables'],
  tenancy: [],
};

/**
 * `access` owns TenantContext, the permission registry and AuditPort, and issue #11 exposes them to
 * every module through access/index.ts. The graph in docs/02-architecture.md section 4 does not
 * list that edge. Modules may therefore import the public API of `access`, except that the modules
 * `access` itself depends on (transitively) may import it for types only, so that no runtime cycle
 * appears (ADR 0009: the graph is acyclic). Flagged for the owner.
 */
export const SHARED_MODULE = 'access';

/** Modules reachable from `module` through MODULE_GRAPH (transitive closure, excluding itself). */
export function reachableModules(module, graph = MODULE_GRAPH) {
  const seen = new Set();
  const pending = [...(graph[module] ?? [])];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    pending.push(...(graph[next] ?? []));
  }
  return [...seen];
}

/**
 * Modules whose public API `module` may import, as written in MODULE_GRAPH plus the shared module.
 * `typeOnly` lists the targets that may be imported with `import type` only.
 */
export function allowedModuleImports(module, graph = MODULE_GRAPH) {
  const value = new Set(graph[module] ?? []);
  const typeOnly = new Set();
  if (module !== SHARED_MODULE) {
    const cyclic = reachableModules(SHARED_MODULE, graph).includes(module);
    (cyclic ? typeOnly : value).add(SHARED_MODULE);
  }
  return { value: [...value], typeOnly: [...typeOnly] };
}

// Files that are not part of the architecture and may import anything.
const IGNORED_FILES = [
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
  '**/test/**',
  '**/__tests__/**',
  '**/node_modules/**',
];

// Patterns are relative to the repository root and match the full path. Elements are folders
// (the first match wins); single files such as index.ts are classified with file categories.
const element = (type, pattern, capture) => ({
  type,
  pattern,
  partialMatch: false,
  stopMatching: true,
  ...(capture ? { capture } : {}),
});

const ELEMENTS = [
  // API modules, one folder per layer (docs/02-architecture.md section 5)
  element('module-domain', 'apps/api/src/modules/*/domain', ['module']),
  element('module-application', 'apps/api/src/modules/*/application', ['module']),
  element('module-infrastructure', 'apps/api/src/modules/*/infrastructure', ['module']),
  element('module-presentation', 'apps/api/src/modules/*/presentation', ['module']),
  // Files at the module root: index.ts, <domain>.module.ts, <domain>.permissions.ts
  element('module', 'apps/api/src/modules/*', ['module']),
  // API outside the modules
  element('api-http', 'apps/api/src/infrastructure/http'),
  element('api-infrastructure', 'apps/api/src/infrastructure'),
  element('api-script', 'apps/api/scripts'),
  element('api-app', 'apps/api/src'),
  // Web features and app shell
  element('feature', 'apps/web/src/features/*', ['feature']),
  element('app', 'apps/*/src/app'),
  element('web-ui', 'apps/web/src/ui'),
  element('web-lib', 'apps/web/src/lib'),
  // Packages
  element('shared-kernel', 'packages/shared-kernel'),
  element('contracts', 'packages/contracts'),
];

const file = (category, pattern) => ({ category, pattern, exclusive: true });

const FILES = [
  file('module-schema', 'apps/api/src/modules/*/infrastructure/schema.ts'),
  file('module-public', 'apps/api/src/modules/*/index.ts'),
  file('module-root', 'apps/api/src/modules/*/*.ts'),
  file('feature-public', 'apps/web/src/features/*/index.ts'),
];

const type = (name, captured, category) => ({
  element: { type: name, ...(captured ? { captured } : {}) },
  ...(category ? { file: { categories: category } } : {}),
});
const sameModule = { module: '{{ from.element.captured.module }}' };
const sameFeature = { feature: '{{ from.element.captured.feature }}' };

/** @param {object | object[]} from entity selector(s) @param {object[]} to allowed targets */
const policy = (from, to) => ({
  from: Array.isArray(from) ? from : [from],
  allow: { to },
});

const publicApi = (captured) => type('module', captured, 'module-public');
const moduleRoot = (captured) => type('module', captured, 'module-root');
const schema = (captured) => type('module-infrastructure', captured, 'module-schema');

// A brace pattern needs two alternatives; a single module name is the pattern itself.
const oneOf = (names) => (names.length === 1 ? names[0] : `{${names.join(',')}}`);

function crossModulePolicies() {
  const policies = [];
  for (const module of Object.keys(MODULE_GRAPH)) {
    const { value, typeOnly } = allowedModuleImports(module);
    const own = { module };
    const from = [
      type('module-application', own),
      type('module-infrastructure', own),
      type('module-presentation', own),
      moduleRoot(own),
    ];
    if (value.length > 0) {
      policies.push(policy(from, [publicApi({ module: oneOf(value) })]));
    }
    if (typeOnly.length > 0) {
      policies.push({
        from,
        allow: { to: [publicApi({ module: oneOf(typeOnly) })], dependency: { kind: 'type' } },
      });
    }
    // schema.ts files reference each other for foreign keys. They stay free of Nest and of any
    // use case, so drizzle-kit can load them alone.
    // Not `access` for the modules it depends on: two schema files importing each other would be
    // a cycle for drizzle-kit.
    const referenced = [...value, ...typeOnly.filter((name) => name !== SHARED_MODULE)];
    if (referenced.length > 0) {
      policies.push(policy([schema(own)], [schema({ module: oneOf(referenced) })]));
    }
    // A domain stays pure (no runtime import of another module) but may name the types of the
    // modules below it, for example the settings snapshot inside TenantContext.
    const named = [...value, ...typeOnly];
    if (named.length > 0) {
      policies.push({
        from: [type('module-domain', own)],
        allow: { to: [publicApi({ module: oneOf(named) })], dependency: { kind: 'type' } },
      });
    }
  }
  return policies;
}

const DEPENDENCIES_RULE = [
  'error',
  {
    default: 'disallow',
    policies: [
      // Modules: pure domain
      policy(type('module-domain'), [type('shared-kernel')]),
      // Modules: use cases
      policy(type('module-application'), [
        type('module-domain', sameModule),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // Use cases take `withTransaction` and the transaction handle as dependencies (ADR 0014,
      // 0016): they may name those types, never import the runtime of the shared infrastructure.
      {
        from: [type('module-application')],
        allow: { to: [type('api-infrastructure')], dependency: { kind: 'type' } },
      },
      // Modules: adapters (the Drizzle schema.ts is part of infrastructure)
      policy(type('module-infrastructure'), [
        type('module-domain', sameModule),
        type('module-application', sameModule),
        type('api-infrastructure'),
        type('shared-kernel'),
      ]),
      // Nest controllers
      policy(type('module-presentation'), [
        type('module-application', sameModule),
        type('api-http'),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // <domain>.module.ts, <domain>.permissions.ts: wire the layers of their own module
      policy(moduleRoot(), [
        type('module-domain', sameModule),
        type('module-application', sameModule),
        type('module-infrastructure', sameModule),
        type('module-presentation', sameModule),
        type('api-http'),
        type('api-infrastructure'),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // index.ts: the public surface of the module
      policy(publicApi(), [
        type('module-domain', sameModule),
        type('module-application', sameModule),
        type('module-infrastructure', sameModule),
        type('module-presentation', sameModule),
        moduleRoot(sameModule),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // Cross-module edges per MODULE_GRAPH
      ...crossModulePolicies(),
      // API shared infrastructure: db, config, logger, events (http/ is its own element so that
      // controllers may use it and nothing else in here)
      policy(
        [type('api-infrastructure'), type('api-http')],
        [
          type('api-infrastructure'),
          type('api-http'),
          type('shared-kernel'),
          type('contracts'),
          schema(),
        ],
      ),
      // withTransaction(ctx: TenantContext) and friends only need the type from access
      {
        from: [type('api-infrastructure'), type('api-http')],
        allow: { to: [publicApi({ module: SHARED_MODULE })], dependency: { kind: 'type' } },
      },
      // main.ts, app.module.ts, app.modules.ts
      policy(type('api-app'), [
        type('api-http'),
        type('api-infrastructure'),
        publicApi(),
        moduleRoot(),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // CLI scripts such as provision-tenant
      policy(type('api-script'), [
        type('api-http'),
        type('api-infrastructure'),
        publicApi(),
        type('shared-kernel'),
        type('contracts'),
      ]),
      // Web: a feature reaches another feature only through its index.ts
      policy(type('feature'), [
        type('feature', sameFeature),
        type('feature', { feature: '!{{ from.element.captured.feature }}' }, 'feature-public'),
        type('contracts'),
        type('shared-kernel'),
        type('web-lib'),
        type('web-ui'),
      ]),
      policy(type('app'), [
        type('feature', undefined, 'feature-public'),
        type('contracts'),
        type('shared-kernel'),
        type('web-lib'),
        type('web-ui'),
      ]),
      policy(type('web-ui'), [type('web-lib'), type('shared-kernel')]),
      policy(type('web-lib'), [type('contracts'), type('shared-kernel')]),
      // Packages
      policy(type('contracts'), [type('shared-kernel')]),
    ],
  },
];

/**
 * @param {{ rootPath?: string }} [options] rootPath: directory the element patterns are relative to
 *   (the repository root; tests point it at a fixture tree).
 */
export function boundariesConfig({ rootPath = REPO_ROOT } = {}) {
  return {
    name: 'mini-market/boundaries',
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': rootPath,
      'boundaries/elements': ELEMENTS,
      'boundaries/files': FILES,
      'boundaries/ignore': IGNORED_FILES,
      // Absolute path: pnpm does not expose this package to the workspaces that run ESLint.
      'import/resolver': {
        [require.resolve('eslint-import-resolver-typescript')]: { alwaysTryTypes: true },
      },
    },
    rules: {
      'boundaries/dependencies': DEPENDENCIES_RULE,
    },
  };
}
