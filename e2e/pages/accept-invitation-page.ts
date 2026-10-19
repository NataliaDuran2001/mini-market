import { expect, type Page } from '@playwright/test';

/** Page object of /accept-invitation (features/auth). */
export class AcceptInvitationPage {
  constructor(private readonly page: Page) {}

  async open(link: string): Promise<void> {
    await this.page.goto(link);
    await expect(
      this.page.getByRole('heading', { name: 'Te invitaron a un negocio' }),
    ).toBeVisible();
  }

  async choosePassword(password: string): Promise<void> {
    await this.page.getByLabel('Contraseña nueva').fill(password);
    await this.page.getByLabel('Repite la contraseña').fill(password);
    await this.page.getByRole('button', { name: 'Aceptar invitación' }).click();
  }
}
