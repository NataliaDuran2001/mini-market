import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { AuthGateway, AuthSession } from './auth-gateway';
import type { TenantStore } from './tenant-store';

export type SessionState =
  | { readonly status: 'loading'; readonly session: null }
  | { readonly status: 'anonymous'; readonly session: null }
  | { readonly status: 'authenticated'; readonly session: AuthSession };

interface AuthContextValue {
  readonly gateway: AuthGateway;
  readonly tenantStore: TenantStore;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  gateway,
  tenantStore,
  children,
}: AuthContextValue & { children: ReactNode }) {
  return <AuthContext.Provider value={{ gateway, tenantStore }}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth hooks require an AuthProvider');
  return value;
}

export function useAuthGateway(): AuthGateway {
  return useAuthContext().gateway;
}

export function useTenantStore(): TenantStore {
  return useAuthContext().tenantStore;
}

/** The session, kept in sync with the provider (sign in, sign out, token refresh). */
export function useSession(): SessionState {
  const gateway = useAuthGateway();
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null });

  useEffect(() => {
    let active = true;
    const apply = (session: AuthSession | null) => {
      if (!active) return;
      setState(
        session ? { status: 'authenticated', session } : { status: 'anonymous', session: null },
      );
    };
    gateway
      .getSession()
      .then(apply)
      .catch(() => {
        apply(null);
      });
    const unsubscribe = gateway.onSessionChange(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [gateway]);

  return state;
}

/** Id of the business the person is working in, or null before one is chosen. */
export function useCurrentTenant(): {
  readonly tenantId: string | null;
  readonly setTenantId: (tenantId: string) => void;
} {
  const store = useTenantStore();
  const tenantId = useSyncExternalStore(store.subscribe, store.get);
  return { tenantId, setTenantId: store.set };
}
