import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { renderApp } from '@/test/render-app';

describe('root layout', () => {
  it('keeps 16px gutters and safe-area padding and never forces horizontal overflow', async () => {
    // AC-5 (#4): jsdom has no layout engine, so this asserts the class contract that guarantees it.
    // The measured check (scrollWidth <= 400 at a 400px viewport) is recorded in the PR.
    renderApp({ path: '/', session: TEST_USER });
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
