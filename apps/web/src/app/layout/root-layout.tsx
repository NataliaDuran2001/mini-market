import { Outlet } from '@tanstack/react-router';

/**
 * Mobile-first layout: 16px gutters (never below the notch or home-bar insets), no
 * horizontal overflow. The navigation shell (#15) replaces this component.
 */
export function RootLayout() {
  return (
    <div
      data-testid="root-layout"
      className="min-h-dvh w-full max-w-full pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))]"
    >
      <main className="mx-auto w-full min-w-0 max-w-6xl py-4">
        <Outlet />
      </main>
    </div>
  );
}
