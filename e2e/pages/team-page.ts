import { expect, type Locator, type Page } from '@playwright/test';

/** Page object of /team (features/team). Labels are the Spanish ones the owner reads. */
export class TeamPage {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Equipo', level: 1 });
  }

  /** The row of a member or invitation, found by its email. */
  row(email: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: email });
  }

  async invite(email: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Invitar empleado' }).click();
    const sheet = this.page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Correo del empleado').fill(email);
    await sheet.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(sheet).toBeHidden();
  }

  /** The notice that follows a change (`role="status"`). */
  notice(text: string | RegExp): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }

  async disable(email: string): Promise<void> {
    await this.page.getByRole('button', { name: `Desactivar a ${email}` }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  async enable(email: string): Promise<void> {
    await this.page.getByRole('button', { name: `Activar a ${email}` }).click();
  }
}
