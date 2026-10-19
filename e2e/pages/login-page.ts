import { expect, type Page } from '@playwright/test';

/** Page object of /login (features/auth). Labels are the Spanish ones the person reads. */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  }

  async submit(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Correo electrónico').fill(email);
    await this.page.getByLabel('Contraseña').fill(password);
    await this.page.getByRole('button', { name: 'Ingresar' }).click();
  }

  /** Signs in and waits for the dashboard of the person's business. */
  async signIn(email: string, password: string): Promise<void> {
    await this.goto();
    await this.submit(email, password);
    await expect(this.page.getByTestId('tenant-name')).toBeVisible();
  }

  get error() {
    return this.page.getByRole('alert');
  }
}
