import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * AppShellPage encapsulates selectors and actions for the structural shell
 * elements that wrap every page: the navigation bar and the footer.
 *
 * Selector rationale:
 *  - `nav.navbar`       — matches the element tag + class emitted by NavigationComponent.
 *                         The *ngIf on currentUser means it is absent when logged out.
 *  - `.footer-brand`    — stable class on the FooterComponent brand span.
 *  - `app-root`         — the host element of AppComponent; background comes from :host CSS.
 */
export class AppShellPage extends BasePage {
  /** The sticky navigation bar rendered by NavigationComponent (only when authenticated). */
  readonly navbar: Locator;

  /** Brand name text inside the nav ("futureMe"). */
  readonly navBrandName: Locator;

  /** Dashboard link inside the nav menu. */
  readonly dashboardLink: Locator;

  /** Settings link inside the nav menu. */
  readonly settingsLink: Locator;

  /** Logout button inside the nav menu. */
  readonly logoutButton: Locator;

  /** Footer brand span emitted by FooterComponent. */
  readonly footerBrand: Locator;

  /** The app-root host element — carries the --bg-app background. */
  readonly appRoot: Locator;

  constructor(page: Page) {
    super(page);
    this.navbar        = page.locator('nav.navbar');
    this.navBrandName  = page.locator('nav.navbar .brand-name');
    this.dashboardLink = page.locator('nav.navbar a[routerlink="/dashboard"]');
    this.settingsLink  = page.locator('nav.navbar a[routerlink="/settings"]');
    this.logoutButton  = page.locator('nav.navbar button.logout-btn');
    this.footerBrand   = page.locator('.footer-brand');
    this.appRoot       = page.locator('app-root');
  }

  /** Returns true if the nav bar element is present in the DOM (not just hidden). */
  async isNavbarPresent(): Promise<boolean> {
    return (await this.navbar.count()) > 0;
  }
}
