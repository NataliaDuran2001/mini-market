import { lazy, Suspense } from 'react';

// Loaded only in development, so production bundles never include the devtools.
const QueryDevtools = import.meta.env.DEV
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
