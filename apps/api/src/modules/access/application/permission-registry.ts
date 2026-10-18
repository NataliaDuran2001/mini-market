import { isValidPermissionName } from '../domain/permissions';
import type { PermissionDefinition, PermissionDefinitions } from '../domain/permissions';

/** Injection token of the registry; `AccessModule` provides one instance per application. */
export const PERMISSION_REGISTRY = Symbol('PERMISSION_REGISTRY');

/**
 * Permissions of every module, filled while the application starts. A module registers its own
 * (`registerPermissions`), so there is no central matrix to edit and merge.
 */
export class PermissionRegistry {
  private readonly definitions = new Map<string, PermissionDefinition>();
  private readonly owners = new Map<string, string>();

  /**
   * @throws Error for a malformed name or one that two modules both claim: both are programming
   *   mistakes that must stop the application from starting.
   */
  register(moduleName: string, definitions: PermissionDefinitions): void {
    for (const [name, definition] of Object.entries(definitions)) {
      if (!isValidPermissionName(name)) {
        throw new Error(
          `Permission "${name}" of module ${moduleName} must look like "area.action"`,
        );
      }
      const owner = this.owners.get(name);
      if (owner !== undefined && owner !== moduleName) {
        throw new Error(`Permission "${name}" is declared by both ${owner} and ${moduleName}`);
      }
      this.owners.set(name, moduleName);
      this.definitions.set(name, definition);
    }
  }

  /** Every definition as one record, ready for `grantedPermissions`. */
  all(): PermissionDefinitions {
    return Object.fromEntries(this.definitions);
  }

  get(name: string): PermissionDefinition | undefined {
    return this.definitions.get(name);
  }

  moduleOf(name: string): string | undefined {
    return this.owners.get(name);
  }
}

/** The function modules call from their `<domain>.permissions.ts` wiring. */
export function registerPermissions(
  registry: PermissionRegistry,
  moduleName: string,
  definitions: PermissionDefinitions,
): void {
  registry.register(moduleName, definitions);
}
