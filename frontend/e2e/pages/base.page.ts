import { Page, expect } from '@playwright/test';

/**
 * Base page object shared by all page objects.
 *
 * Provides helpers for:
 *  - navigating to a path
 *  - reading CSS custom properties (design tokens) from :root
 *  - asserting that the document <title> matches
 *  - checking whether a <link> tag is present in <head>
 */
export class BasePage {
  constructor(protected page: Page) {}

  /** Navigate to the given path relative to baseURL. */
  async goto(path: string) {
    await this.page.goto(path);
  }

  /**
   * Returns the computed value of a CSS custom property defined on :root.
   * Strips surrounding whitespace so the value can be compared directly.
   */
  async getCssCustomProperty(propertyName: string): Promise<string> {
    return this.page.evaluate((prop: string) => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(prop)
        .trim();
    }, propertyName);
  }

  /**
   * Returns the computed background-color of a selector as a string.
   * Useful for verifying design-token-driven colours are actually applied.
   */
  async getComputedBackgroundColor(selector: string): Promise<string> {
    return this.page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Selector not found: ${sel}`);
      return getComputedStyle(el).backgroundColor;
    }, selector);
  }

  /** True when a <link rel="stylesheet" …> or generic <link> whose href contains
   *  the given substring is present in <head>. */
  async hasLinkTagWithHref(hrefSubstring: string): Promise<boolean> {
    return this.page.evaluate((substr: string) => {
      const links = Array.from(document.querySelectorAll('head link'));
      return links.some(l => (l.getAttribute('href') ?? '').includes(substr));
    }, hrefSubstring);
  }

  /** Returns the current document <title>. */
  async getDocumentTitle(): Promise<string> {
    return this.page.title();
  }
}
