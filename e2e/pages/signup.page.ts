import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class SignupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/signup');
    await expect(this.page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
  }

  async fillName(name: string) {
    await this.page.getByLabel('Full Name').fill(name);
  }

  async fillEmail(email: string) {
    await this.page.getByLabel('Email').fill(email);
  }

  async fillPassword(password: string) {
    // Label "Password" matches both password fields — target by placeholder to be precise
    await this.page.getByPlaceholder('At least 6 characters').fill(password);
  }

  async fillConfirmPassword(password: string) {
    await this.page.getByPlaceholder('Re-enter your password').fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Sign Up' }).click();
  }

  async signup(name: string, email: string, password: string) {
    await this.fillName(name);
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.fillConfirmPassword(password);
    await this.submit();
  }

  async errorMessage() {
    return this.page.locator('.error-message').textContent();
  }

  async successMessage() {
    return this.page.locator('.success-message').textContent();
  }
}
