/**
 * Keys of every query that depends on the selected business start with `['t', tenantId]`, so the
 * caches of two businesses never mix and switching business invalidates them all at once
 * (`queryClient.invalidateQueries({ queryKey: TENANT_SCOPE })`).
 */
export const TENANT_SCOPE = ['t'] as const;

export function tenantKey(tenantId: string | null, ...parts: readonly unknown[]) {
  return [...TENANT_SCOPE, tenantId, ...parts] as const;
}
