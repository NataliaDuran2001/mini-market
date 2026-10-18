import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import home from '@/locales/es/home.json';
import { renderWithProviders } from '@/test/render-with-providers';
import { createAppRouter } from './router';

function renderApp(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  return renderWithProviders(<RouterProvider router={router} />);
}

describe('app routes', () => {
  it('renders the placeholder at / with Spanish text from the i18n resources', async () => {
    // AC-1
    renderApp('/');
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(screen.getByText(home.subtitle)).toBeInTheDocument();
  });

  it('renders the /login placeholder from the auth namespace', async () => {
    // AC-1
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument();
  });

  it('renders the Spanish 404 page for an unknown route', async () => {
    // AC-1
    renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', { name: common.notFound.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: common.notFound.backHome })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
