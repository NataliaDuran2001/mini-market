import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import home from '@/locales/es/home.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { renderApp } from '@/test/render-app';

describe('app routes', () => {
  it('renders the placeholder at / with Spanish text from the i18n resources', async () => {
    // AC-1 (#4)
    renderApp({ path: '/', session: TEST_USER });
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(screen.getByText(home.subtitle)).toBeInTheDocument();
  });

  it('renders the /login page from the auth namespace', async () => {
    // AC-1 (#4)
    renderApp({ path: '/login' });
    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument();
  });

  it('renders the Spanish 404 page for an unknown route', async () => {
    // AC-1 (#4)
    renderApp({ path: '/does-not-exist', session: TEST_USER });
    expect(await screen.findByRole('heading', { name: common.notFound.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: common.notFound.backHome })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
