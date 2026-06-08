import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * OnboardingPage encapsulates selectors and actions for the /onboarding route.
 *
 * The page renders two side-by-side cards:
 *  1. "Create a household"  — name input + Create button
 *  2. "Join a household"    — invite-code input + Join button
 *
 * Selector rationale
 * ------------------
 * The template does NOT use <label> elements for its inputs — both are bare
 * <input> elements identified only by `placeholder` attribute.
 *
 *  - getByPlaceholder()    — preferred over CSS class when a placeholder is
 *                            the only stable, semantic hook on an unlabelled
 *                            input. Angular-template-driven placeholders are
 *                            rarely changed without intent.
 *  - getByRole('heading')  — resilient; matches H2 text content.
 *  - getByRole('button')   — resilient; matches the button's visible label.
 *  - `.error-text`         — the component renders error paragraphs with this
 *                            stable BEM class; there is no role-based
 *                            equivalent for an inline error message.
 *
 * NOTE: if the template is extended to add <label> elements the selectors
 * for the inputs should be migrated to getByLabel() for even stronger
 * semantic anchoring.
 */
export class OnboardingPage extends BasePage {
  // ── "Create a household" card ──────────────────────────────────────────────
  readonly createHeading: Locator;
  readonly householdNameInput: Locator;
  readonly createButton: Locator;
  readonly createError: Locator;

  // ── "Join a household" card ────────────────────────────────────────────────
  readonly joinHeading: Locator;
  readonly inviteCodeInput: Locator;
  readonly joinButton: Locator;
  readonly joinError: Locator;

  // ── Wrapper ────────────────────────────────────────────────────────────────
  readonly onboardingWrapper: Locator;

  constructor(page: Page) {
    super(page);

    this.onboardingWrapper  = page.locator('.onboarding-wrapper');

    this.createHeading      = page.getByRole('heading', { name: 'Create a household' });
    this.householdNameInput = page.getByPlaceholder('Household name');
    this.createButton       = page.getByRole('button', { name: 'Create' });
    // The *ngIf-controlled error paragraph — may be absent from DOM when no error.
    this.createError        = page.locator('.error-text').first();

    this.joinHeading        = page.getByRole('heading', { name: 'Join a household' });
    this.inviteCodeInput    = page.getByPlaceholder('Invite code');
    this.joinButton         = page.getByRole('button', { name: 'Join' });
    // The second .error-text is inside the join card.
    this.joinError          = page.locator('.error-text').nth(1);
  }

  override async goto() {
    await super.goto('/onboarding');
  }

  /**
   * Fills the household-name input and clicks Create.
   * Returns after the click; callers should assert the navigation or error.
   */
  async createHousehold(name: string): Promise<void> {
    await this.householdNameInput.fill(name);
    await this.createButton.click();
  }

  /**
   * Fills the invite-code input and clicks Join.
   * Returns after the click; callers should assert the navigation or error.
   */
  async joinHousehold(code: string): Promise<void> {
    await this.inviteCodeInput.fill(code);
    await this.joinButton.click();
  }
}
