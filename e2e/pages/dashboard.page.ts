import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async isLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
