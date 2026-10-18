import { describe, expect, it, vi } from 'vitest';
import { createTenantStore, TENANT_STORAGE_KEY } from './tenant-store';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('storage blocked');
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe('tenant store', () => {
  it('persists the selected tenant and restores it', () => {
    // AC-1
    const storage = memoryStorage();
    createTenantStore(storage).set('tenant-a');
    expect(storage.getItem(TENANT_STORAGE_KEY)).toBe('tenant-a');
    expect(createTenantStore(storage).get()).toBe('tenant-a');
  });

  it('notifies subscribers only when the value changes', () => {
    const store = createTenantStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set('tenant-a');
    store.set('tenant-a');
    store.clear();
    unsubscribe();
    store.set('tenant-b');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('works in memory when localStorage throws', () => {
    // AC-1 (localStorage wrapped in try/catch)
    const store = createTenantStore(throwingStorage());
    expect(store.get()).toBeNull();
    expect(() => {
      store.set('tenant-a');
    }).not.toThrow();
    expect(store.get()).toBe('tenant-a');
    expect(() => {
      store.clear();
    }).not.toThrow();
    expect(store.get()).toBeNull();
  });

  it('works without any storage', () => {
    const store = createTenantStore(null);
    store.set('tenant-a');
    expect(store.get()).toBe('tenant-a');
  });
});
