import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '@/app/router';
import { renderWithProviders } from '@/test/render-with-providers';

describe('root layout', () => {
  it('keeps 16px gutters and safe-area padding and never forces horizontal overflow', async () => {
    // AC-5: jsdom has no layout engine, so this asserts the class contract that guarantees it.
    // The measured check (scrollWidth <= 400 at a 400px viewport) is recorded in the PR.
    const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });
    renderWithProviders(<RouterProvider router={router} />);
    const layout = await screen.findByTestId('root-layout');
    const classes = layout.className;
    expect(classes).toContain('max-w-full');
    expect(classes).toContain('pl-[max(1rem,env(safe-area-inset-left))]');
    expect(classes).toContain('pr-[max(1rem,env(safe-area-inset-right))]');
    expect(classes).toContain('pt-[env(safe-area-inset-top)]');
    expect(classes).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(classes).not.toMatch(/(^|\s)(min-w-|w-\[\d+px\]|overflow-x-scroll)/);
  });
});
