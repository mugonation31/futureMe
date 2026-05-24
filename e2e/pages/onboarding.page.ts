import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class OnboardingPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/onboarding');
    await expect(this.page.getByRole('heading', { name: 'Create a household' })).toBeVisible();
  }

  async isLoaded() {
    await expect(this.page.getByRole('heading', { name: 'Create a household' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Join a household' })).toBeVisible();
  }

  async createHousehold(name: string) {
    await this.page.getByPlaceholder('Household name').fill(name);
    await this.page.getByRole('button', { name: 'Create' }).click();
  }

  async joinHousehold(inviteCode: string) {
    await this.page.getByPlaceholder('Invite code').fill(inviteCode);
    await this.page.getByRole('button', { name: 'Join' }).click();
  }

  async createError() {
    return this.page.locator('.error-text').first().textContent();
  }

  async joinError() {
    return this.page.locator('.error-text').last().textContent();
  }

  async isCreateButtonDisabled() {
    return this.page.getByRole('button', { name: /Create|Creating/ }).isDisabled();
  }

  async isJoinButtonDisabled() {
    return this.page.getByRole('button', { name: /Join|Joining/ }).isDisabled();
  }
}
