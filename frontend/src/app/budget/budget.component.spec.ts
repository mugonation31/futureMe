import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { BudgetComponent } from './budget.component';
import { BudgetService } from '../core/services/budget.service';
import { BudgetResponse } from '../core/models/budget.models';

/** Fresh deep copy of a realistic household budget payload per test. */
function makeBudget(overrides: Partial<BudgetResponse> = {}): BudgetResponse {
  return {
    id: 'budget-1',
    scope: 'household',
    user_id: null,
    household_id: 'hh-1',
    month: '2026-07-01',
    currency: 'GBP',
    goals: { fundamentals_goal_pct: 50, future_you_goal_pct: 20, fun_goal_pct: 30 },
    total_income: 3000,
    income_streams: [
      { id: 'inc-1', budget_id: 'budget-1', label: 'Salary', amount: 2500, position: 0, created_at: '', updated_at: '' },
      { id: 'inc-2', budget_id: 'budget-1', label: 'Side gig', amount: 500, position: 1, created_at: '', updated_at: '' },
    ],
    buckets: {
      fundamentals: {
        line_items: [
          { id: 'li-1', budget_id: 'budget-1', bucket: 'fundamentals', label: 'Rent', amount: 1200, position: 0, created_at: '', updated_at: '' },
        ],
        dashboard: { bucket: 'fundamentals', goal_pct: 50, ideal_amount: 1500, actual_pct: 40, bucket_total: 1200, available_to_spend: 300, is_over_flag: false },
      },
      future_you: {
        line_items: [
          { id: 'li-2', budget_id: 'budget-1', bucket: 'future_you', label: 'ISA', amount: 400, position: 0, created_at: '', updated_at: '' },
        ],
        dashboard: { bucket: 'future_you', goal_pct: 20, ideal_amount: 600, actual_pct: 13.33, bucket_total: 400, available_to_spend: 200, is_over_flag: false },
      },
      fun: {
        line_items: [
          { id: 'li-3', budget_id: 'budget-1', bucket: 'fun', label: 'Eating out', amount: 150, position: 0, created_at: '', updated_at: '' },
        ],
        dashboard: { bucket: 'fun', goal_pct: 30, ideal_amount: 900, actual_pct: 5, bucket_total: 150, available_to_spend: 750, is_over_flag: false },
      },
    },
    allocation_status: { state: 'left', amount: 1250 },
    ...overrides,
  };
}

describe('BudgetComponent', () => {
  let component: BudgetComponent;
  let fixture: ComponentFixture<BudgetComponent>;
  let mockBudgetService: jasmine.SpyObj<BudgetService>;

  beforeEach(async () => {
    mockBudgetService = jasmine.createSpyObj<BudgetService>('BudgetService', [
      'getBudget',
      'createIncome',
      'updateIncome',
      'deleteIncome',
      'createLineItem',
      'updateLineItem',
      'deleteLineItem',
      'updateGoals',
      'updateCurrency',
    ]);
    mockBudgetService.getBudget.and.returnValue(of(makeBudget()));

    await TestBed.configureTestingModule({
      imports: [BudgetComponent],
      providers: [{ provide: BudgetService, useValue: mockBudgetService }],
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetComponent);
    component = fixture.componentInstance;
  });

  /** Shorthand for the root DOM element. */
  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return el().querySelector(selector)?.textContent ?? '';
  }

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render a Budget heading', () => {
    fixture.detectChanges();
    const heading = el().querySelector('.budget-title');
    expect(heading?.textContent).toContain('Budget');
  });

  describe('loading and error states', () => {
    it('should show a loading state while the budget is loading', () => {
      // Arrange — a getBudget call that never resolves during the test
      const pending = new Subject<BudgetResponse>();
      mockBudgetService.getBudget.and.returnValue(pending.asObservable());

      // Act
      fixture.detectChanges();

      // Assert
      expect(el().querySelector('.budget-loading')).toBeTruthy();
      expect(el().querySelector('.income-section')).toBeFalsy();

      // Resolve — loading clears, content appears
      pending.next(makeBudget());
      pending.complete();
      fixture.detectChanges();
      expect(el().querySelector('.budget-loading')).toBeFalsy();
      expect(el().querySelector('.income-section')).toBeTruthy();
    });

    it('should show an error state when the budget fails to load', () => {
      // Arrange
      mockBudgetService.getBudget.and.returnValue(throwError(() => new Error('boom')));

      // Act
      fixture.detectChanges();

      // Assert
      expect(el().querySelector('.budget-error')).toBeTruthy();
      expect(el().querySelector('.income-section')).toBeFalsy();
      expect(el().querySelector('.budget-loading')).toBeFalsy();
    });
  });

  describe('income section rendering', () => {
    it('should render one row per income stream with label and amount', () => {
      // Act
      fixture.detectChanges();

      // Assert
      const rows = el().querySelectorAll('.income-row');
      expect(rows.length).toBe(2);
      expect(rows[0].querySelector('.income-label')?.textContent).toContain('Salary');
      expect(rows[0].querySelector('.income-amount')?.textContent).toContain('2,500.00');
      expect(rows[1].querySelector('.income-label')?.textContent).toContain('Side gig');
      expect(rows[1].querySelector('.income-amount')?.textContent).toContain('500.00');
    });

    it('should render a live income total computed from the income streams', () => {
      // Act
      fixture.detectChanges();

      // Assert — 2500 + 500, formatted with the budget currency symbol
      expect(text('.income-total')).toContain('£3,000.00');
    });
  });

  describe('income CRUD', () => {
    it('should call createIncome with budgetId and payload, then refetch the budget', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.createIncome.and.returnValue(of(makeBudget().income_streams[0]));
      mockBudgetService.getBudget.calls.reset();

      // Act — fill the inline add form and submit
      const labelInput = el().querySelector('.income-add-label') as HTMLInputElement;
      const amountInput = el().querySelector('.income-add-amount') as HTMLInputElement;
      labelInput.value = 'Bonus';
      amountInput.value = '100';
      (el().querySelector('.income-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      // Assert
      expect(mockBudgetService.createIncome).toHaveBeenCalledWith('budget-1', { label: 'Bonus', amount: 100 });
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);
    });

    it('should block a negative income amount client-side', () => {
      // Arrange
      fixture.detectChanges();

      // Act
      const labelInput = el().querySelector('.income-add-label') as HTMLInputElement;
      const amountInput = el().querySelector('.income-add-amount') as HTMLInputElement;
      labelInput.value = 'Bad';
      amountInput.value = '-5';
      (el().querySelector('.income-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      // Assert
      expect(mockBudgetService.createIncome).not.toHaveBeenCalled();
    });

    it('should call updateIncome with budgetId, incomeId and payload, then refetch', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.updateIncome.and.returnValue(of(makeBudget().income_streams[0]));
      mockBudgetService.getBudget.calls.reset();

      // Act — enter edit mode on the first row
      (el().querySelector('.income-row .income-edit-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      const editLabel = el().querySelector('.income-row .income-edit-label') as HTMLInputElement;
      const editAmount = el().querySelector('.income-row .income-edit-amount') as HTMLInputElement;
      // Inputs are prefilled from the row being edited
      expect(editLabel.value).toBe('Salary');
      expect(editAmount.value).toBe('2500');

      editLabel.value = 'Main salary';
      editAmount.value = '2600';
      (el().querySelector('.income-row .income-save-btn') as HTMLButtonElement).click();

      // Assert
      expect(mockBudgetService.updateIncome).toHaveBeenCalledWith('budget-1', 'inc-1', { label: 'Main salary', amount: 2600 });
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);
    });

    it('should call deleteIncome with budgetId and incomeId, then refetch', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.deleteIncome.and.returnValue(of(undefined as unknown as void));
      mockBudgetService.getBudget.calls.reset();

      // Act
      (el().querySelector('.income-row .income-delete-btn') as HTMLButtonElement).click();

      // Assert
      expect(mockBudgetService.deleteIncome).toHaveBeenCalledWith('budget-1', 'inc-1');
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);
    });

    it('should discard a stale refetch response when a newer refetch supersedes it', () => {
      // Arrange — two rapid deletes whose refetch GETs resolve out of order
      fixture.detectChanges();
      mockBudgetService.deleteIncome.and.returnValue(of(undefined as unknown as void));

      const staleGet = new Subject<BudgetResponse>();
      const freshGet = new Subject<BudgetResponse>();
      mockBudgetService.getBudget.and.returnValues(staleGet.asObservable(), freshGet.asObservable());

      // Act — delete two rows back to back (each triggers a refetch)
      (el().querySelector('.income-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      const remainingDeletes = el().querySelectorAll('.income-delete-btn');
      (remainingDeletes[remainingDeletes.length - 1] as HTMLButtonElement).click();
      fixture.detectChanges();

      // The NEWER refetch resolves first with the true state: one row left
      const fresh = makeBudget();
      fresh.income_streams = [fresh.income_streams[1]]; // only 'Side gig'
      freshGet.next(fresh);
      freshGet.complete();
      fixture.detectChanges();
      expect(el().querySelectorAll('.income-row').length).toBe(1);

      // The STALE refetch (still two rows) arrives late — it must be discarded
      staleGet.next(makeBudget());
      staleGet.complete();
      fixture.detectChanges();

      // Assert — the deleted row does not reappear
      expect(el().querySelectorAll('.income-row').length).toBe(1);
      expect(text('.income-row .income-label')).toContain('Side gig');
    });

    it('should disable a row\'s buttons while its mutation is in flight', () => {
      // Arrange — a delete that never resolves during the test
      fixture.detectChanges();
      mockBudgetService.deleteIncome.and.returnValue(new Subject<void>().asObservable());

      // Act
      const firstRow = el().querySelector('.income-row') as HTMLElement;
      (firstRow.querySelector('.income-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Assert
      expect((firstRow.querySelector('.income-delete-btn') as HTMLButtonElement).disabled).toBeTrue();
      expect((firstRow.querySelector('.income-edit-btn') as HTMLButtonElement).disabled).toBeTrue();
    });
  });

  describe('bucket sections rendering', () => {
    it('should render three buckets in order Fundamentals, Future You, Fun with subtitles', () => {
      // Act
      fixture.detectChanges();

      // Assert — DOM order and heading/subtitle copy
      const sections = el().querySelectorAll('.bucket-section');
      expect(sections.length).toBe(3);

      expect(sections[0].getAttribute('data-bucket')).toBe('fundamentals');
      expect(sections[0].querySelector('.bucket-heading')?.textContent).toContain('Fundamentals');
      expect(sections[0].querySelector('.bucket-subtitle')?.textContent).toContain('your needs');

      expect(sections[1].getAttribute('data-bucket')).toBe('future_you');
      expect(sections[1].querySelector('.bucket-heading')?.textContent).toContain('Future You');
      expect(sections[1].querySelector('.bucket-subtitle')?.textContent).toContain('savings & investments');

      expect(sections[2].getAttribute('data-bucket')).toBe('fun');
      expect(sections[2].querySelector('.bucket-heading')?.textContent).toContain('Fun');
      expect(sections[2].querySelector('.bucket-subtitle')?.textContent).toContain('your wants');
    });

    it('should render each bucket\'s line items with label and amount', () => {
      // Act
      fixture.detectChanges();

      // Assert
      const fundamentals = el().querySelector('.bucket-section[data-bucket="fundamentals"]')!;
      const futureYou = el().querySelector('.bucket-section[data-bucket="future_you"]')!;
      const fun = el().querySelector('.bucket-section[data-bucket="fun"]')!;

      expect(fundamentals.querySelector('.item-label')?.textContent).toContain('Rent');
      expect(fundamentals.querySelector('.item-amount')?.textContent).toContain('1,200.00');
      expect(futureYou.querySelector('.item-label')?.textContent).toContain('ISA');
      expect(fun.querySelector('.item-label')?.textContent).toContain('Eating out');
    });
  });

  describe('line-item CRUD', () => {
    function bucketEl(key: string): HTMLElement {
      return el().querySelector(`.bucket-section[data-bucket="${key}"]`) as HTMLElement;
    }

    it('should call createLineItem with the bucket key of the section, then refetch', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.createLineItem.and.returnValue(of(makeBudget().buckets.future_you.line_items[0]));
      mockBudgetService.getBudget.calls.reset();

      // Act — add inside the Future You section
      const section = bucketEl('future_you');
      (section.querySelector('.item-add-label') as HTMLInputElement).value = 'Pension';
      (section.querySelector('.item-add-amount') as HTMLInputElement).value = '200';
      (section.querySelector('.item-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      // Assert
      expect(mockBudgetService.createLineItem).toHaveBeenCalledWith('budget-1', {
        bucket: 'future_you',
        label: 'Pension',
        amount: 200,
      });
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);
    });

    it('should block a negative line-item amount client-side', () => {
      // Arrange
      fixture.detectChanges();

      // Act
      const section = bucketEl('fun');
      (section.querySelector('.item-add-label') as HTMLInputElement).value = 'Bad';
      (section.querySelector('.item-add-amount') as HTMLInputElement).value = '-1';
      (section.querySelector('.item-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      // Assert
      expect(mockBudgetService.createLineItem).not.toHaveBeenCalled();
    });

    it('should call updateLineItem with budgetId, itemId and payload, then refetch', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.updateLineItem.and.returnValue(of(makeBudget().buckets.fundamentals.line_items[0]));
      mockBudgetService.getBudget.calls.reset();

      // Act — edit the Rent row in Fundamentals
      const section = bucketEl('fundamentals');
      (section.querySelector('.item-edit-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      const editLabel = section.querySelector('.item-edit-label') as HTMLInputElement;
      const editAmount = section.querySelector('.item-edit-amount') as HTMLInputElement;
      expect(editLabel.value).toBe('Rent');
      expect(editAmount.value).toBe('1200');

      editLabel.value = 'Rent + bills';
      editAmount.value = '1300';
      (section.querySelector('.item-save-btn') as HTMLButtonElement).click();

      // Assert
      expect(mockBudgetService.updateLineItem).toHaveBeenCalledWith('budget-1', 'li-1', {
        label: 'Rent + bills',
        amount: 1300,
      });
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);

      // Confirmed success exits edit mode
      fixture.detectChanges();
      expect(section.querySelector('.item-edit-label')).toBeFalsy();
    });

    it('should call deleteLineItem with budgetId and itemId, then refetch', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.deleteLineItem.and.returnValue(of(undefined as unknown as void));
      mockBudgetService.getBudget.calls.reset();

      // Act
      (bucketEl('fun').querySelector('.item-delete-btn') as HTMLButtonElement).click();

      // Assert
      expect(mockBudgetService.deleteLineItem).toHaveBeenCalledWith('budget-1', 'li-3');
      expect(mockBudgetService.getBudget).toHaveBeenCalledTimes(1);
    });

    it('should preserve the typed add-form values when createLineItem fails', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.createLineItem.and.returnValue(throwError(() => new Error('nope')));

      // Act
      const section = bucketEl('fun');
      const label = section.querySelector('.item-add-label') as HTMLInputElement;
      const amount = section.querySelector('.item-add-amount') as HTMLInputElement;
      label.value = 'Cinema';
      amount.value = '25';
      (section.querySelector('.item-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      // Assert — nothing typed is lost, and the failure is surfaced
      expect(label.value).toBe('Cinema');
      expect(amount.value).toBe('25');
      expect(el().querySelector('.mutation-error')).toBeTruthy();
    });

    it('should clear the add form only after createLineItem succeeds', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.createLineItem.and.returnValue(of(makeBudget().buckets.fun.line_items[0]));

      // Act
      const section = bucketEl('fun');
      const label = section.querySelector('.item-add-label') as HTMLInputElement;
      const amount = section.querySelector('.item-add-amount') as HTMLInputElement;
      label.value = 'Cinema';
      amount.value = '25';
      (section.querySelector('.item-add-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      // Assert — confirmed success clears the inputs
      expect(label.value).toBe('');
      expect(amount.value).toBe('');
    });

    it('should stay in edit mode with the typed values when updateLineItem fails', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.updateLineItem.and.returnValue(throwError(() => new Error('nope')));

      // Act — edit Rent, change values, save fails
      const section = bucketEl('fundamentals');
      (section.querySelector('.item-edit-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      (section.querySelector('.item-edit-label') as HTMLInputElement).value = 'Rent + bills';
      (section.querySelector('.item-edit-amount') as HTMLInputElement).value = '1300';
      (section.querySelector('.item-save-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Assert — still in edit mode, typed values intact, failure surfaced
      const stillEditingLabel = section.querySelector('.item-edit-label') as HTMLInputElement;
      expect(stillEditingLabel).toBeTruthy();
      expect(stillEditingLabel.value).toBe('Rent + bills');
      expect((section.querySelector('.item-edit-amount') as HTMLInputElement).value).toBe('1300');
      expect(el().querySelector('.mutation-error')).toBeTruthy();
    });

    it('should disable a line-item row\'s buttons while its mutation is in flight', () => {
      // Arrange — a delete that never resolves during the test
      fixture.detectChanges();
      mockBudgetService.deleteLineItem.and.returnValue(new Subject<void>().asObservable());

      // Act
      const row = bucketEl('fundamentals').querySelector('.line-item-row') as HTMLElement;
      (row.querySelector('.item-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Assert
      expect((row.querySelector('.item-delete-btn') as HTMLButtonElement).disabled).toBeTrue();
      expect((row.querySelector('.item-edit-btn') as HTMLButtonElement).disabled).toBeTrue();
    });
  });

  describe('goal percentages', () => {
    function goalInput(bucket: string): HTMLInputElement {
      return el().querySelector(`.bucket-section[data-bucket="${bucket}"] .goal-input`) as HTMLInputElement;
    }

    function setGoal(bucket: string, value: string): void {
      const input = goalInput(bucket);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('should seed the per-bucket goal inputs from the payload with a live total and save enabled at 100', () => {
      // Act
      fixture.detectChanges();

      // Assert — per-bucket goal cells seeded 50/20/30
      expect(goalInput('fundamentals').value).toBe('50');
      expect(goalInput('future_you').value).toBe('20');
      expect(goalInput('fun').value).toBe('30');

      expect(text('.goals-total')).toContain('100%');
      expect((el().querySelector('.goals-save') as HTMLButtonElement).disabled).toBeFalse();
      expect(el().querySelector('.goals-hint')).toBeFalsy();
    });

    it('should disable save and show a calm hint when the goals do not sum to 100', () => {
      // Arrange
      fixture.detectChanges();

      // Act — bump Fundamentals to 60 so the total is 110
      setGoal('fundamentals', '60');
      fixture.detectChanges();

      // Assert
      expect(text('.goals-total')).toContain('110%');
      expect((el().querySelector('.goals-save') as HTMLButtonElement).disabled).toBeTrue();
      expect(el().querySelector('.goals-hint')).toBeTruthy();
    });

    it('should treat decimal goals summing to 100 within tolerance as valid (no float tail)', () => {
      // Arrange
      fixture.detectChanges();

      // Act — 33.4 + 33.3 + 33.3 === 99.99999999999999 in floating point
      setGoal('fundamentals', '33.4');
      setGoal('future_you', '33.3');
      setGoal('fun', '33.3');
      fixture.detectChanges();

      // Assert — Save enabled, displayed total rounded (no 99.9999… tail)
      expect((el().querySelector('.goals-save') as HTMLButtonElement).disabled).toBeFalse();
      expect(el().querySelector('.goals-hint')).toBeFalsy();
      expect(text('.goals-total')).toContain('100%');
      expect(text('.goals-total')).not.toContain('99.9');
    });

    it('should clamp a negative goal input to 0 (never lets a negative reach the draft)', () => {
      // Arrange
      fixture.detectChanges();

      // Act — try to type a negative goal
      setGoal('fundamentals', '-20');
      fixture.detectChanges();

      // Assert — cell reflects the clamp; total counts 0, not -20
      expect(goalInput('fundamentals').value).toBe('0');
      expect(text('.goals-total')).toContain('50%');
    });

    it('should not emit 0 and rebind when a goal cell is cleared for retyping', () => {
      // Arrange
      fixture.detectChanges();

      // Act — clear the cell (mid-edit)
      setGoal('fundamentals', '');
      fixture.detectChanges();

      // Assert — the cell stays blank (no hostile "0" write-back) and the
      // draft keeps its last committed value
      expect(goalInput('fundamentals').value).toBe('');
      expect(text('.goals-total')).toContain('100%');
    });

    it('should save all three goals at exactly 100 and consume the returned budget without a refetch', () => {
      // Arrange
      fixture.detectChanges();
      const returned = makeBudget({
        goals: { fundamentals_goal_pct: 40, future_you_goal_pct: 30, fun_goal_pct: 30 },
      });
      returned.income_streams[0].label = 'Returned salary';
      mockBudgetService.updateGoals.and.returnValue(of(returned));
      mockBudgetService.getBudget.calls.reset();

      // Act — rebalance to 40/30/30 and save
      setGoal('fundamentals', '40');
      setGoal('future_you', '30');
      setGoal('fun', '30');
      fixture.detectChanges();

      const saveBtn = el().querySelector('.goals-save') as HTMLButtonElement;
      expect(saveBtn.disabled).toBeFalse();
      saveBtn.click();
      fixture.detectChanges();

      // Assert — all three sent in one payload, response consumed directly
      expect(mockBudgetService.updateGoals).toHaveBeenCalledWith('budget-1', {
        fundamentals_goal_pct: 40,
        future_you_goal_pct: 30,
        fun_goal_pct: 30,
      });
      expect(mockBudgetService.getBudget).not.toHaveBeenCalled();
      expect(text('.income-row .income-label')).toContain('Returned salary');
      expect(goalInput('fundamentals').value).toBe('40');
    });
  });

  describe('mutation errors', () => {
    it('should show a calm error banner when a mutation fails, and clear it on the next successful action', () => {
      // Arrange — a delete that fails
      fixture.detectChanges();
      mockBudgetService.deleteIncome.and.returnValue(throwError(() => new Error('nope')));

      // Act
      (el().querySelector('.income-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Assert — banner visible with a human message, row re-enabled
      expect(el().querySelector('.mutation-error')).toBeTruthy();
      expect(text('.mutation-error').trim().length).toBeGreaterThan(0);
      expect((el().querySelector('.income-delete-btn') as HTMLButtonElement).disabled).toBeFalse();

      // Act — the next action succeeds
      mockBudgetService.deleteIncome.and.returnValue(of(undefined as unknown as void));
      (el().querySelector('.income-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Assert — banner cleared
      expect(el().querySelector('.mutation-error')).toBeFalsy();
    });

    it('should reset the currency select and show the banner when updateCurrency fails', () => {
      // Arrange
      fixture.detectChanges();
      mockBudgetService.updateCurrency.and.returnValue(throwError(() => new Error('nope')));

      // Act — pick EUR, which fails server-side
      const select = el().querySelector('.currency-select') as HTMLSelectElement;
      select.value = 'EUR';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Assert — banner shown, select snapped back to the budget's currency,
      // money still rendered with the old symbol
      expect(el().querySelector('.mutation-error')).toBeTruthy();
      expect(select.value).toBe('GBP');
      expect(text('.income-total')).toContain('£3,000.00');
    });
  });

  describe('currency', () => {
    it('should persist via updateCurrency, consume the response and re-render money with the new symbol', () => {
      // Arrange — budget currency starts as GBP (rendered as £ elsewhere)
      fixture.detectChanges();
      mockBudgetService.updateCurrency.and.returnValue(of(makeBudget({ currency: 'USD' })));
      mockBudgetService.getBudget.calls.reset();

      // Act
      const select = el().querySelector('.currency-select') as HTMLSelectElement;
      expect(select.value).toBe('GBP');
      select.value = 'USD';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Assert — full response consumed directly, no refetch, $ everywhere
      expect(mockBudgetService.updateCurrency).toHaveBeenCalledWith('budget-1', 'USD');
      expect(mockBudgetService.getBudget).not.toHaveBeenCalled();
      expect(text('.income-total')).toContain('$3,000.00');
      const fundamentals = el().querySelector('.bucket-section[data-bucket="fundamentals"]')!;
      expect(fundamentals.querySelector('.item-amount')?.textContent).toContain('$1,200.00');
    });

    it('should keep an unsaved goal edit when the currency changes', () => {
      // Arrange — an in-progress goal edit that has NOT been saved
      fixture.detectChanges();
      const setGoal = (bucket: string, value: string): void => {
        const input = el().querySelector(`.bucket-section[data-bucket="${bucket}"] .goal-input`) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      setGoal('fundamentals', '40');
      setGoal('future_you', '30');
      setGoal('fun', '30');
      fixture.detectChanges();

      // The currency PATCH returns the full budget carrying the SERVER goals
      // (still 50/20/30) — consuming it must NOT revert the user's draft.
      mockBudgetService.updateCurrency.and.returnValue(of(makeBudget({ currency: 'USD' })));
      const select = el().querySelector('.currency-select') as HTMLSelectElement;
      select.value = 'USD';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      // Assert — currency applied, but the goal draft survived (still 40/30/30)
      expect(text('.income-total')).toContain('$3,000.00');
      const goalInput = (bucket: string): HTMLInputElement =>
        el().querySelector(`.bucket-section[data-bucket="${bucket}"] .goal-input`) as HTMLInputElement;
      expect(goalInput('fundamentals').value).toBe('40');
      expect(goalInput('future_you').value).toBe('30');
      expect(goalInput('fun').value).toBe('30');
    });

    it('should drop a late refetch that a newer currency change has superseded', () => {
      // Arrange — an income delete whose refetch GET we hold open
      fixture.detectChanges();
      mockBudgetService.deleteIncome.and.returnValue(of(undefined as unknown as void));
      const staleRefetch = new Subject<BudgetResponse>();
      mockBudgetService.getBudget.and.returnValue(staleRefetch.asObservable());

      // Act — delete a row (fires the refetch GET, now in flight)…
      (el().querySelector('.income-delete-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      // …then change currency, which resolves first with the new-currency budget
      mockBudgetService.updateCurrency.and.returnValue(of(makeBudget({ currency: 'USD' })));
      const select = el().querySelector('.currency-select') as HTMLSelectElement;
      select.value = 'USD';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(text('.income-total')).toContain('$3,000.00');

      // The STALE refetch (pre-change, GBP) arrives late — it must be discarded,
      // not allowed to clobber the newer currency.
      staleRefetch.next(makeBudget({ currency: 'GBP' }));
      staleRefetch.complete();
      fixture.detectChanges();

      // Assert — currency stays USD; the late GBP snapshot did not win
      expect(text('.income-total')).toContain('$3,000.00');
      expect(text('.income-total')).not.toContain('£');
    });

    it('should pass a raw stored symbol (DB default "$") through unchanged', () => {
      // Arrange — the DB default is the raw symbol '$', not a code
      mockBudgetService.getBudget.and.returnValue(of(makeBudget({ currency: '$' })));

      // Act
      fixture.detectChanges();

      // Assert — '$' is not in the code map, so it passes through as-is
      expect(text('.income-total')).toContain('$3,000.00');
      expect(text('.income-total')).not.toContain('£');
    });

    it('should normalise the GBP code to the £ symbol', () => {
      // Act — default fixture currency is the code 'GBP'
      fixture.detectChanges();

      // Assert
      expect(text('.income-total')).toContain('£3,000.00');
    });
  });
});
