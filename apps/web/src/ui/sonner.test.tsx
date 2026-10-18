import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import common from '@/locales/es/common.json';
import { renderWithProviders } from '@/test/render-with-providers';
import { toast } from './sonner';

describe('Toaster', () => {
  it('labels the region and the close button in Spanish, not with sonner English defaults', async () => {
    renderWithProviders(<p>contenido</p>);
    act(() => {
      toast('mensaje');
    });
    expect(await screen.findByLabelText(common.toast.region)).toBeInTheDocument();
    expect(await screen.findByLabelText(common.actions.close)).toBeInTheDocument();
    expect(screen.queryByLabelText(/close toast/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/notifications/i)).not.toBeInTheDocument();
  });
});
