import { expect, type Locator, type Page } from '@playwright/test';

export type CapitalKind = 'Aporte' | 'Retiro';
type SummaryCard = 'contributed' | 'withdrawn' | 'net';

/** Page object of /capital (features/equity). Labels are the Spanish ones the owner reads. */
export class CapitalPage {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Capital', exact: true });
  }

  /** The amount shown in one summary card, for example `Bs 11.500,00`. */
  card(name: SummaryCard): Locator {
    return this.page.getByTestId(`summary-${name}`);
  }

  /** The text of the notice that follows a save (`role="status"`). */
  get notice(): Locator {
    return this.page
      .getByRole('status')
      .filter({ hasText: /Movimiento registrado|supera el capital/ });
  }

  /** Rows of the ledger, newest first. */
  get rows(): Locator {
    return this.page.getByRole('row').filter({ hasNot: this.page.getByRole('columnheader') });
  }

  async record(kind: CapitalKind, amount: string, note?: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Registrar movimiento' }).click();
    const sheet = this.page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // The kind is a radio group drawn as two buttons; the input itself is visually hidden.
    await sheet.locator('label', { hasText: kind }).click();
    await sheet.getByLabel('Monto (Bs)').fill(amount);
    if (note) await sheet.getByLabel('Nota (opcional)').fill(note);
    await sheet.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(sheet).toBeHidden();
  }
}
