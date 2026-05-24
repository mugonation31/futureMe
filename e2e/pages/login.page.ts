import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/login');
    await expect(this.page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  }

  async fillEmail(email: string) {
    await this.page.getByLabel('Email').fill(email);
  }

  async fillPassword(password: string) {
    await this.page.getByLabel('Password').fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async login(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async errorMessage() {
    return this.page.locator('.error-message').textContent();
  }

  async isSubmitDisabled() {
    return this.page.getByRole('button', { name: /Login|Logging in/ }).isDisabled();
  }
}
