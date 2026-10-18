import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import home from '@/locales/es/home.json';
import { apiUrl } from '@/test/msw/api-url';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render-with-providers';
import { HomePage } from './home-page';

describe('HomePage', () => {
  it('renders data from the mocked API through the MSW handler', async () => {
    // AC-2
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('status')).toHaveTextContent(home.api.checking);
    expect(await screen.findByText(home.api.ok)).toBeInTheDocument();
  });

  it('shows the Spanish error when the API is unreachable', async () => {
    // AC-2
    server.use(http.get(apiUrl('/health'), () => HttpResponse.error()));
    renderWithProviders(<HomePage />);
    expect(await screen.findByText(home.api.error)).toBeInTheDocument();
  });

  it('shows the Spanish error when the API answers with a failure', async () => {
    // AC-2
    server.use(
      http.get(apiUrl('/health'), () => HttpResponse.json({ code: 'boom' }, { status: 500 })),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByText(home.api.error)).toBeInTheDocument();
  });
});
