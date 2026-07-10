import { Component, DestroyRef, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, map, switchMap } from 'rxjs';
import { BudgetService } from '../core/services/budget.service';
import { BucketKey, BudgetGoalsUpdate, BudgetResponse, CurrencyCode } from '../core/models/budget.models';
import { BucketSectionComponent, LineItemDraft, LineItemEdit } from './bucket-section/bucket-section.component';
import { CURRENCY_CODES, codeFor, formatMoney, parseAmount, symbolFor } from './money';

/** Static heading/subtitle copy for the three buckets, in canonical order. */
interface BucketDef {
  key: BucketKey;
  heading: string;
  subtitle: string;
}

/** Maps a bucket key to its goal-% field on the goals payload. */
const GOAL_FIELD: Record<BucketKey, keyof BudgetGoalsUpdate> = {
  fundamentals: 'fundamentals_goal_pct',
  future_you: 'future_you_goal_pct',
  fun: 'fun_goal_pct',
};

/**
 * BudgetComponent — the home of the Intentional Spending Tracker.
 *
 * Loads the current-month household budget (auto-created by the backend on
 * first access) and renders the income streams plus the three spending
 * buckets: Fundamentals, Future You, Fun.
 */
@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [BucketSectionComponent],
  templateUrl: './budget.component.html',
  styleUrl: './budget.component.scss',
})
export class BudgetComponent implements OnInit {
  private budgetService = inject(BudgetService);
  private destroyRef = inject(DestroyRef);

  /**
   * Single refetch channel: every post-mutation refresh goes through this
   * subject so `switchMap` cancels any stale in-flight GET when a newer
   * refetch is requested — an out-of-order response can never clobber
   * newer refetch state (e.g. a deleted row reappearing).
   *
   * Cross-channel ordering (a refetch vs a direct-consumed currency/goals
   * save that bypasses this subject) is guarded separately by `consumeSeq`.
   */
  private readonly refetch$ = new Subject<void>();

  /**
   * Monotonic generation counter, bumped every time a full budget is applied
   * directly (currency/goals saves via `applyBudget`). A refetch GET captures
   * this value when it is issued and drops its result if the counter has moved
   * on by the time it resolves — so a late refetch cannot clobber a newer
   * direct-consumed budget.
   */
  private consumeSeq = 0;

  /** Video labels as headings, spreadsheet terms as subtitles. Order matters. */
  readonly bucketDefs: readonly BucketDef[] = [
    { key: 'fundamentals', heading: 'Fundamentals', subtitle: 'your needs' },
    { key: 'future_you', heading: 'Future You', subtitle: 'savings & investments' },
    { key: 'fun', heading: 'Fun', subtitle: 'your wants' },
  ];

  loading = true;
  error = false;
  budget: BudgetResponse | null = null;

  /**
   * Calm, human-readable message shown when a mutation fails. Set by any
   * failed save/delete, cleared at the start of the next attempt and on
   * success — never left stale.
   */
  mutationError: string | null = null;

  /** True while the inline income add form is submitting. */
  addingIncome = false;
  /** Income stream ids with an update/delete in flight (buttons disabled). */
  readonly pendingIncomeIds = new Set<string>();
  /** The income stream currently in inline edit mode, if any. */
  editingIncomeId: string | null = null;

  /** The bucket whose add form is currently submitting, if any. */
  addingItemBucket: BucketKey | null = null;
  /** Line item ids with an update/delete in flight (row buttons disabled). */
  readonly pendingItemIds = new Set<string>();
  /**
   * The line item currently in inline edit mode (mirrors `editingIncomeId`).
   * Cleared only on CONFIRMED save success so a failed update never
   * discards the user's typed values.
   */
  editingLineItemId: string | null = null;

  @ViewChildren(BucketSectionComponent)
  private bucketSections?: QueryList<BucketSectionComponent>;

  /**
   * Draft goal percentages, seeded from the payload (spreadsheet defaults
   * 50/20/30). Kept as drafts so mid-edit values survive income/line-item
   * refetches; reseeded whenever a full BudgetResponse is consumed directly.
   */
  goalDraft: BudgetGoalsUpdate = {
    fundamentals_goal_pct: 50,
    future_you_goal_pct: 20,
    fun_goal_pct: 30,
  };
  /** True while a goals save is in flight. */
  savingGoals = false;

  /** Options offered by the currency selector. */
  readonly currencyCodes = CURRENCY_CODES;
  /** True while a currency change is in flight. */
  savingCurrency = false;

  ngOnInit(): void {
    this.refetch$
      .pipe(
        switchMap(() => {
          const seqAtRequest = this.consumeSeq;
          return this.budgetService.getBudget().pipe(
            map((budget) => ({ budget, seqAtRequest })),
            catchError(() => EMPTY),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ budget, seqAtRequest }) => {
        // Drop a refetch whose GET was issued before a later direct-consume
        // (currency/goals save) applied a newer budget — otherwise this stale
        // snapshot would clobber the newer state. Deliberately does NOT reseed
        // goal drafts either: income/line-item mutations never change goals,
        // and reseeding would clobber a goal edit in progress.
        if (seqAtRequest !== this.consumeSeq) return;
        this.budget = budget;
      });

    this.budgetService.getBudget().subscribe({
      next: (budget) => {
        this.consumeBudget(budget);
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  /** Display symbol for the budget's own currency (code or raw symbol). */
  get symbol(): string {
    return symbolFor(this.budget?.currency ?? '');
  }

  /** Live client-computed income total; reconciled on every refetch. */
  get incomeTotal(): number {
    return (this.budget?.income_streams ?? []).reduce((sum, s) => sum + s.amount, 0);
  }

  money(value: number): string {
    return formatMoney(this.symbol, value);
  }

  // ---- Currency ----

  /** The stored currency mapped back to a selectable code (or null). */
  get currencyCode(): CurrencyCode | null {
    return codeFor(this.budget?.currency ?? '');
  }

  onCurrencyChange(event: Event): void {
    if (!this.budget || this.savingCurrency) return;

    const select = event.target as HTMLSelectElement;
    const code = select.value as CurrencyCode;
    this.mutationError = null;
    this.savingCurrency = true;
    this.budgetService.updateCurrency(this.budget.id, code).subscribe({
      next: (budget) => {
        // updateCurrency returns the full budget — no refetch needed. Apply it
        // WITHOUT reseeding goal drafts, so an unsaved goal edit survives a
        // currency change (currency and goals are independent concerns).
        this.applyBudget(budget);
        this.savingCurrency = false;
      },
      error: () => {
        // The native select still shows the user's failed choice — snap it
        // back to the currency the budget actually has.
        select.value = this.currencyCode ?? '';
        this.failMutation("Couldn't change the currency just now — please try again.", () => (this.savingCurrency = false));
      },
    });
  }

  // ---- Income CRUD ----

  addIncome(event: Event, labelInput: HTMLInputElement, amountInput: HTMLInputElement): void {
    event.preventDefault();
    if (!this.budget || this.addingIncome) return;

    const label = labelInput.value.trim();
    const amount = parseAmount(amountInput.value);
    if (!label || amount === null) return;

    this.mutationError = null;
    this.addingIncome = true;
    this.budgetService.createIncome(this.budget.id, { label, amount }).subscribe({
      next: () => {
        labelInput.value = '';
        amountInput.value = '';
        this.refetchAfterMutation(() => (this.addingIncome = false));
      },
      error: () => this.failMutation("Couldn't add that income just now — please try again.", () => (this.addingIncome = false)),
    });
  }

  startEditIncome(incomeId: string): void {
    this.editingIncomeId = incomeId;
  }

  cancelEditIncome(): void {
    this.editingIncomeId = null;
  }

  saveIncome(incomeId: string, labelInput: HTMLInputElement, amountInput: HTMLInputElement): void {
    if (!this.budget || this.pendingIncomeIds.has(incomeId)) return;

    const label = labelInput.value.trim();
    const amount = parseAmount(amountInput.value);
    if (!label || amount === null) return;

    this.mutationError = null;
    this.pendingIncomeIds.add(incomeId);
    this.budgetService.updateIncome(this.budget.id, incomeId, { label, amount }).subscribe({
      next: () => {
        this.editingIncomeId = null;
        this.refetchAfterMutation(() => this.pendingIncomeIds.delete(incomeId));
      },
      error: () => this.failMutation("Couldn't save that income change just now — please try again.", () => this.pendingIncomeIds.delete(incomeId)),
    });
  }

  removeIncome(incomeId: string): void {
    if (!this.budget || this.pendingIncomeIds.has(incomeId)) return;

    this.mutationError = null;
    this.pendingIncomeIds.add(incomeId);
    this.budgetService.deleteIncome(this.budget.id, incomeId).subscribe({
      next: () => this.refetchAfterMutation(() => this.pendingIncomeIds.delete(incomeId)),
      error: () => this.failMutation("Couldn't remove that income just now — please try again.", () => this.pendingIncomeIds.delete(incomeId)),
    });
  }

  // ---- Goal percentages ----

  goalPctFor(bucket: BucketKey): number {
    return this.goalDraft[GOAL_FIELD[bucket]];
  }

  onGoalChange(bucket: BucketKey, pct: number): void {
    this.goalDraft = { ...this.goalDraft, [GOAL_FIELD[bucket]]: pct };
  }

  /** Live total of the three draft goal percentages (raw float sum). */
  get goalsTotal(): number {
    return (
      this.goalDraft.fundamentals_goal_pct +
      this.goalDraft.future_you_goal_pct +
      this.goalDraft.fun_goal_pct
    );
  }

  /** The total rounded to 2dp for display — never a floating-point tail. */
  get goalsTotalDisplay(): number {
    return Math.round(this.goalsTotal * 100) / 100;
  }

  /**
   * Float-tolerant 100% check (matching the backend's tolerance), so decimal
   * goals like 33.4/33.3/33.3 don't leave Save permanently disabled.
   */
  get goalsAt100(): boolean {
    return Math.abs(this.goalsTotal - 100) < 0.001;
  }

  /** The backend enforces all-three-or-none summing to 100. */
  get goalsSaveDisabled(): boolean {
    return this.savingGoals || !this.goalsAt100;
  }

  saveGoals(): void {
    if (!this.budget || this.goalsSaveDisabled) return;

    this.mutationError = null;
    this.savingGoals = true;
    this.budgetService.updateGoals(this.budget.id, { ...this.goalDraft }).subscribe({
      next: (budget) => {
        // updateGoals returns the full recomputed budget — no refetch needed.
        this.consumeBudget(budget);
        this.savingGoals = false;
      },
      error: () => this.failMutation("Couldn't save your goals just now — please try again.", () => (this.savingGoals = false)),
    });
  }

  // ---- Line-item CRUD (events emitted by the bucket sections) ----

  addLineItem(bucket: BucketKey, draft: LineItemDraft): void {
    if (!this.budget || this.addingItemBucket) return;

    this.mutationError = null;
    this.addingItemBucket = bucket;
    this.budgetService.createLineItem(this.budget.id, { bucket, ...draft }).subscribe({
      next: () => {
        // Confirmed success — only now is the bucket's add form cleared.
        this.bucketSections?.find((s) => s.bucketKey === bucket)?.resetAddForm();
        this.refetchAfterMutation(() => (this.addingItemBucket = null));
      },
      error: () => this.failMutation("Couldn't add that line item just now — please try again.", () => (this.addingItemBucket = null)),
    });
  }

  saveLineItem(edit: LineItemEdit): void {
    if (!this.budget || this.pendingItemIds.has(edit.id)) return;

    this.mutationError = null;
    this.pendingItemIds.add(edit.id);
    this.budgetService.updateLineItem(this.budget.id, edit.id, { label: edit.label, amount: edit.amount }).subscribe({
      next: () => {
        // Confirmed success — only now does the row leave edit mode.
        this.editingLineItemId = null;
        this.refetchAfterMutation(() => this.pendingItemIds.delete(edit.id));
      },
      error: () => this.failMutation("Couldn't save that line item just now — please try again.", () => this.pendingItemIds.delete(edit.id)),
    });
  }

  removeLineItem(itemId: string): void {
    if (!this.budget || this.pendingItemIds.has(itemId)) return;

    this.mutationError = null;
    this.pendingItemIds.add(itemId);
    this.budgetService.deleteLineItem(this.budget.id, itemId).subscribe({
      next: () => this.refetchAfterMutation(() => this.pendingItemIds.delete(itemId)),
      error: () => this.failMutation("Couldn't remove that line item just now — please try again.", () => this.pendingItemIds.delete(itemId)),
    });
  }

  /**
   * Income and line-item mutations return only the entity, so the computed
   * budget is refreshed with a full refetch after each successful mutation.
   * The row's cleanup runs immediately (the mutation itself has succeeded);
   * the refetch is pushed through the switchMap'd channel above.
   */
  private refetchAfterMutation(cleanup: () => void): void {
    cleanup();
    this.refetch$.next();
  }

  /** Surface a calm mutation-failure message and run the row's cleanup. */
  private failMutation(message: string, cleanup: () => void): void {
    this.mutationError = message;
    cleanup();
  }

  /**
   * Apply a full BudgetResponse as the authoritative current state, bumping
   * `consumeSeq` so any refetch GET already in flight is dropped rather than
   * allowed to clobber this newer budget. Does NOT touch goal drafts — callers
   * that represent a goals write reseed them separately via `consumeBudget`.
   */
  private applyBudget(budget: BudgetResponse): void {
    this.budget = budget;
    this.consumeSeq++;
  }

  /**
   * Apply a full BudgetResponse AND reseed the goal drafts from it. Used on the
   * initial load and after a goals save — NOT on the currency path, which must
   * leave an in-progress goal edit intact.
   */
  private consumeBudget(budget: BudgetResponse): void {
    this.applyBudget(budget);
    this.goalDraft = { ...budget.goals };
  }
}
