import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object of the app shell (app/shell): header, and the menu in whichever form the viewport
 * shows: bottom tab bar plus the "Más" sheet on a phone, sidebar from 1024px.
 */
export class ShellPage {
  constructor(private readonly page: Page) {}

  get tenantName(): Locator {
    return this.page.getByTestId('tenant-name');
  }

  /** The navigation landmark that is visible at this viewport. */
  private get navigation(): Locator {
    return this.page.getByRole('navigation', { name: 'Navegación principal' });
  }

  private get isPhone(): boolean {
    return (this.page.viewportSize()?.width ?? 1280) < 1024;
  }

  /** Names of every section the person can reach from the menu. */
  async sections(): Promise<string[]> {
    // The menu is filtered once the role and the modules are known; wait for its first entry.
    await expect(this.navigation.getByRole('link').first()).toBeVisible();
    // Sections that need a permission appear once the role is known: wait for the first of them.
    await expect(this.navigation.getByRole('link', { name: 'Vender' })).toBeVisible();
    const names = await this.navigation.getByRole('link').allInnerTexts();
    if (this.isPhone) {
      await this.navigation.getByRole('button', { name: 'Más' }).click();
      const sheet = this.page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      names.push(...(await sheet.getByRole('link').allInnerTexts()));
      await this.page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
    return names.map((name) => name.trim());
  }

  async openAccountMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'Cuenta' }).click();
  }

  async logout(): Promise<void> {
    await this.openAccountMenu();
    await this.page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(this.page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  }
}
