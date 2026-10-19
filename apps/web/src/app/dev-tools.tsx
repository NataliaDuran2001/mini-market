import { lazy, Suspense } from 'react';

// Loaded only in development, so production bundles never include the devtools. The end-to-end
// suite sets VITE_QUERY_DEVTOOLS=off: the floating button would cover the mobile tab bar.
const QueryDevtools =
  import.meta.env.DEV && import.meta.env.VITE_QUERY_DEVTOOLS !== 'off'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((module) => ({
          default: module.ReactQueryDevtools,
        })),
      )
    : null;

export function DevTools() {
  if (!QueryDevtools) return null;
  return (
    <Suspense fallback={null}>
      <QueryDevtools buttonPosition="bottom-right" />
    </Suspense>
  );
}
