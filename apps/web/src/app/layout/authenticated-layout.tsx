import { Outlet } from '@tanstack/react-router';
import { LogoutButton } from '@/features/auth';

/**
 * Frame of every signed-in screen. For now only a logout button; the navigation shell (#15)
 * replaces this component.
 */
export function AuthenticatedLayout() {
  return (
    <>
      <header className="flex justify-end pb-2">
        <LogoutButton variant="ghost" />
      </header>
      <Outlet />
    </>
  );
}
