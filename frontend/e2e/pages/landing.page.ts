import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * LandingPage encapsulates selectors and actions for the / (root) route.
 *
 * Selector rationale:
 *  - getByRole('heading')  — semantic heading role; most resilient selector for
 *                            the hero headline and feature card headings.
 *  - getByRole('link')     — role-based selector for CTA anchor tags; matches
 *                            the <a routerLink="…"> elements rendered by Angular.
 *  - `.hero-actions .btn-primary` / `.hero-actions .btn-ghost`
 *                          — stable utility classes defined in styles.scss; used
 *                            only for style-correctness assertions (display,
 *                            background-color) not for interaction.
 *  - `.feature.card`       — BEM + utility class combo present on every feature
 *                            card; used for count assertions.
 */
export class LandingPage extends BasePage {
  /** The main hero headline element. */
  readonly heroHeadline: Locator;

  /** The brand wordmark inside the hero section. */
  readonly heroBrand: Locator;

  /** The "Get started free" CTA link that navigates to /signup. */
  readonly getStartedLink: Locator;

  /** The "Sign in" CTA link that navigates to /login. */
  readonly signInLink: Locator;

  /**
   * All three feature cards (.feature.card).
   * Using a compound selector of both classes to be specific; the `.card`
   * class is a global utility and `.feature` scopes it to this section.
   */
  readonly featureCards: Locator;

  /**
   * The primary CTA <a> element inside .hero-actions.
   * Used for style assertions (display, background) rather than interaction.
   * Scoped to .hero-actions to avoid matching other .btn-primary elements.
   */
  readonly heroPrimaryBtn: Locator;

  /**
   * The ghost CTA <a> element inside .hero-actions.
   * Used for style assertions only.
   */
  readonly heroGhostBtn: Locator;

  constructor(page: Page) {
    super(page);

    // The hero headline text is "Financial peace, one month at a time."
    // We match by partial text via getByRole to stay resilient to minor copy edits.
    this.heroHeadline   = page.getByRole('heading', { level: 1 });

    this.heroBrand      = page.locator('.hero .brand');

    // Role-based link selectors — tied to visible link text, not href.
    this.getStartedLink = page.getByRole('link', { name: 'Get started free' });
    this.signInLink     = page.getByRole('link', { name: 'Sign in' });

    // All elements that carry both .feature and .card classes.
    this.featureCards   = page.locator('.feature.card');

    // Style-assertion helpers — scoped to avoid ambiguity.
    this.heroPrimaryBtn = page.locator('.hero-actions .btn-primary');
    this.heroGhostBtn   = page.locator('.hero-actions .btn-ghost');
  }

  override async goto() {
    await super.goto('/');
  }

  /**
   * Returns the computed `display` value of the element identified by the
   * given locator. Useful for verifying that `display: inline-block` is
   * applied to the CTA buttons.
   */
  async getDisplayValue(locator: Locator): Promise<string> {
    return locator.evaluate(el => getComputedStyle(el).display);
  }
}
