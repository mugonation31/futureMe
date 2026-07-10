import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * BudgetPage encapsulates selectors for the /budget route — the core
 * Intentional Spending Tracker screen (Task 28): income streams with a live
 * total, the three spending buckets (Fundamentals / Future You / Fun) with
 * inline line-item CRUD, per-bucket goal-% cells with a save-at-100 bar, and
 * the budget-scoped currency selector.
 *
 * Selector rationale
 * ------------------
 *  - getByRole('heading', { name: 'Budget' }) — the H1 heading, resilient to
 *    class changes.
 *  - `.budget-page` — top-level wrapper class used as the "page loaded" sentinel.
 *  - `[data-bucket="..."]` — stable per-bucket hooks on each bucket section.
 */
export class BudgetPage extends BasePage {
  readonly container: Locator;
  readonly heading: Locator;

  // Load states
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  /** Calm amber banner shown when a save/delete fails (cleared on next action). */
  readonly mutationErrorBanner: Locator;

  // Income section
  readonly incomeSection: Locator;
  readonly incomeRows: Locator;
  readonly incomeAddLabel: Locator;
  readonly incomeAddAmount: Locator;
  readonly incomeAddButton: Locator;
  readonly incomeTotal: Locator;

  // Bucket sections (DOM order: Fundamentals, Future You, Fun)
  readonly bucketSections: Locator;
  readonly fundamentalsSection: Locator;
  readonly futureYouSection: Locator;
  readonly funSection: Locator;

  // Goal percentages
  readonly goalsTotal: Locator;
  readonly goalsHint: Locator;
  readonly goalsSaveButton: Locator;

  // Currency
  readonly currencySelect: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('.budget-page');
    this.heading   = page.getByRole('heading', { name: 'Budget', level: 1 });

    this.loadingIndicator    = page.locator('.budget-loading');
    this.errorMessage        = page.locator('.budget-error');
    this.mutationErrorBanner = page.locator('.mutation-error');

    this.incomeSection   = page.locator('.income-section');
    this.incomeRows      = page.locator('.income-row');
    this.incomeAddLabel  = page.locator('.income-add-label');
    this.incomeAddAmount = page.locator('.income-add-amount');
    this.incomeAddButton = page.locator('.income-add-btn');
    this.incomeTotal     = page.locator('.income-total');

    this.bucketSections      = page.locator('.bucket-section');
    this.fundamentalsSection = this.bucketSection('fundamentals');
    this.futureYouSection    = this.bucketSection('future_you');
    this.funSection          = this.bucketSection('fun');

    this.goalsTotal      = page.locator('.goals-total');
    this.goalsHint       = page.locator('.goals-hint');
    this.goalsSaveButton = page.locator('.goals-save');

    this.currencySelect = page.locator('.currency-select');
  }

  override async goto() {
    await super.goto('/budget');
  }

  /** The section element for one bucket: 'fundamentals' | 'future_you' | 'fun'. */
  bucketSection(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.page.locator(`.bucket-section[data-bucket="${bucket}"]`);
  }

  /** Line-item rows within one bucket. */
  bucketRows(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.line-item-row');
  }

  /** The spreadsheet-style goal-% input in one bucket's header. */
  goalInput(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.goal-input');
  }

  /** The inline add form controls within one bucket. */
  bucketAddLabel(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.item-add-label');
  }

  bucketAddAmount(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.item-add-amount');
  }

  bucketAddButton(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.item-add-btn');
  }

  // ---- Bucket header copy ----

  /** The H2 heading inside one bucket section (e.g. "Future You"). */
  bucketHeading(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.bucket-heading');
  }

  /** The subtitle line under one bucket's heading (e.g. "your wants"). */
  bucketSubtitle(bucket: 'fundamentals' | 'future_you' | 'fun'): Locator {
    return this.bucketSection(bucket).locator('.bucket-subtitle');
  }

  // ---- Income row helpers ----

  /** The income row whose label cell shows the given text. */
  incomeRowByLabel(label: string): Locator {
    return this.incomeRows.filter({ hasText: label });
  }

  /** Read-mode Edit / Delete buttons inside an income row. */
  incomeEditButton(row: Locator): Locator {
    return row.locator('.income-edit-btn');
  }

  incomeDeleteButton(row: Locator): Locator {
    return row.locator('.income-delete-btn');
  }

  /** Edit-mode controls inside an income row. */
  incomeEditLabelInput(row: Locator): Locator {
    return row.locator('.income-edit-label');
  }

  incomeEditAmountInput(row: Locator): Locator {
    return row.locator('.income-edit-amount');
  }

  incomeSaveButton(row: Locator): Locator {
    return row.locator('.income-save-btn');
  }

  /** The formatted amount cell of a read-mode income row. */
  incomeAmountCell(row: Locator): Locator {
    return row.locator('.income-amount');
  }

  // ---- Line-item row helpers ----

  /** The line-item row (within one bucket) whose label shows the given text. */
  bucketRowByLabel(bucket: 'fundamentals' | 'future_you' | 'fun', label: string): Locator {
    return this.bucketRows(bucket).filter({ hasText: label });
  }

  itemEditButton(row: Locator): Locator {
    return row.locator('.item-edit-btn');
  }

  itemDeleteButton(row: Locator): Locator {
    return row.locator('.item-delete-btn');
  }

  itemEditLabelInput(row: Locator): Locator {
    return row.locator('.item-edit-label');
  }

  itemEditAmountInput(row: Locator): Locator {
    return row.locator('.item-edit-amount');
  }

  itemSaveButton(row: Locator): Locator {
    return row.locator('.item-save-btn');
  }

  /** The formatted amount cell of a read-mode line-item row. */
  itemAmountCell(row: Locator): Locator {
    return row.locator('.item-amount');
  }
}
