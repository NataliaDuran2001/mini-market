export const TENANT_STORAGE_KEY = 'mini-market.tenantId';

/** The business the person is working in. Persisted so a reload keeps it. */
export interface TenantStore {
  get(): string | null;
  set(tenantId: string): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * localStorage can be missing or throw (private window, blocked site data), so every access is
 * wrapped; the store then simply works in memory for the page lifetime.
 */
export function createTenantStore(storage: Storage | null = safeLocalStorage()): TenantStore {
  const listeners = new Set<() => void>();
  let current: string | null = readStored(storage);

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    get: () => current,
    set(tenantId) {
      if (tenantId === current) return;
      current = tenantId;
      writeStored(storage, tenantId);
      notify();
    },
    clear() {
      if (current === null) return;
      current = null;
      writeStored(storage, null);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readStored(storage: Storage | null): string | null {
  try {
    return storage?.getItem(TENANT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStored(storage: Storage | null, tenantId: string | null): void {
  try {
    if (tenantId === null) storage?.removeItem(TENANT_STORAGE_KEY);
    else storage?.setItem(TENANT_STORAGE_KEY, tenantId);
  } catch {
    // Persisting is a convenience; the in-memory value stays correct.
  }
}
