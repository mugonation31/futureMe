import { Page, expect } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  async waitForUrl(pattern: string | RegExp) {
    await this.page.waitForURL(pattern, { timeout: 10_000 });
  }

  currentUrl(): string {
    return this.page.url();
  }

  async expectUrl(path: string) {
    await expect(this.page).toHaveURL(new RegExp(path));
  }
}
