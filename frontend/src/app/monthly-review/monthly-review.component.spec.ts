import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { MonthlyReviewComponent } from './monthly-review.component';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense } from '../core/models/money.models';

describe('MonthlyReviewComponent', () => {
  let component: MonthlyReviewComponent;
  let fixture: ComponentFixture<MonthlyReviewComponent>;
  let mockMoneyService: {
    getIncome: jasmine.Spy;
    getExpenses: jasmine.Spy;
  };

  const mockIncomeList: IncomeEntry[] = [
    {
      id: 'inc-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      source: 'Salary',
      amount: 3000,
      frequency: 'monthly',
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  const mockExpenseList: Expense[] = [
    {
      id: 'exp-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      category: 'Groceries',
      description: 'Weekly shop',
      amount: 500,
      date: '2026-06-01',
      is_recurring: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  beforeEach(async () => {
    mockMoneyService = {
      getIncome: jasmine.createSpy('getIncome').and.returnValue(of(mockIncomeList)),
      getExpenses: jasmine.createSpy('getExpenses').and.returnValue(of(mockExpenseList)),
    };

    await TestBed.configureTestingModule({
      imports: [MonthlyReviewComponent, HttpClientTestingModule],
      providers: [
        { provide: MoneyService, useValue: mockMoneyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MonthlyReviewComponent);
    component = fixture.componentInstance;
  });

  // Test 10: should filter expenses to only show those in the selected month
  it('should return only expenses matching selectedMonth via filteredExpenses', () => {
    component.expenses = [
      { ...mockExpenseList[0], id: 'exp-june', amount: 100, date: '2026-06-10' },
      { ...mockExpenseList[0], id: 'exp-may',  amount: 200, date: '2026-05-15' },
      { ...mockExpenseList[0], id: 'exp-june2', amount: 50, date: '2026-06-20' },
    ];
    component.selectedMonth = '2026-06';
    const filtered = component.filteredExpenses;
    expect(filtered.length).toBe(2);
    expect(filtered.every((e: Expense) => e.date.startsWith('2026-06'))).toBeTrue();
  });

  // Test 9: should reload expenses when month changes, setting loading=true then false
  it('should reload expenses when month changes, setting loading=true then loading=false on success', () => {
    fixture.detectChanges();
    const callsBefore = mockMoneyService.getExpenses.calls.count();

    component.onMonthChange('2026-05');

    expect(component.selectedMonth).toBe('2026-05');
    expect(mockMoneyService.getExpenses.calls.count()).toBeGreaterThan(callsBefore);
    expect(component.loading).toBeFalse();
  });

  // Test 11: should set loading=false on error in onMonthChange
  it('should set loading=false on error in onMonthChange', () => {
    mockMoneyService.getExpenses.and.returnValue(throwError(() => new Error('Network error')));
    fixture.detectChanges();

    component.onMonthChange('2026-05');

    expect(component.loading).toBeFalse();
  });

  // Test 8: should show empty state when no expenses
  it('should show empty state when no expenses', () => {
    mockMoneyService.getExpenses.and.returnValue(of([]));
    fixture.detectChanges();
    const emptyEl = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl.textContent).toContain('No expenses recorded for this month');
  });

  // Test 7: should display expense list
  it('should display expense list', () => {
    mockMoneyService.getExpenses.and.returnValue(of([
      { ...mockExpenseList[0], date: '2026-06-01' },
    ]));
    // Set selectedMonth to match the fixture month so the expense shows
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Use an expense date in the current month
    mockMoneyService.getExpenses.and.returnValue(of([
      { ...mockExpenseList[0], date: `${currentMonth}-01` },
    ]));
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.expense-row');
    expect(rows.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Weekly shop');
  });

  // Test 6: should mark isOnTrack false when expenses exceed income
  it('should mark isOnTrack false when expenses exceed income', () => {
    component.income = [{ ...mockIncomeList[0], amount: 500, frequency: 'monthly' }];
    component.expenses = [{ ...mockExpenseList[0], amount: 2000, date: '2026-06-01' }];
    component.selectedMonth = '2026-06';
    expect(component.isOnTrack).toBeFalse();
  });

  // Test 5: should mark isOnTrack true when net savings >= 0
  it('should mark isOnTrack true when net savings >= 0', () => {
    component.income = [{ ...mockIncomeList[0], amount: 3000, frequency: 'monthly' }];
    component.expenses = [{ ...mockExpenseList[0], amount: 2000, date: '2026-06-01' }];
    component.selectedMonth = '2026-06';
    expect(component.isOnTrack).toBeTrue();
  });

  // Test 4: should compute net savings as income minus expenses
  it('should compute net savings as income minus expenses', () => {
    component.income = [{ ...mockIncomeList[0], amount: 3000, frequency: 'monthly' }];
    component.expenses = [{ ...mockExpenseList[0], amount: 1200, date: '2026-06-01' }];
    component.selectedMonth = '2026-06';
    expect(component.netSavings).toBe(1800);
  });

  // Test 3: should display total expenses for selected month
  it('should display total expenses for selected month', () => {
    component.expenses = [
      { ...mockExpenseList[0], amount: 200, date: '2026-06-10' },
      { ...mockExpenseList[0], id: 'exp-2', amount: 300, date: '2026-06-15' },
      { ...mockExpenseList[0], id: 'exp-3', amount: 999, date: '2026-05-01' }, // different month
    ];
    component.selectedMonth = '2026-06';
    expect(component.totalExpenses).toBe(500);
  });

  // Test 2: should display total income from income entries
  it('should display total income from income entries', () => {
    component.income = [
      { ...mockIncomeList[0], amount: 3000, frequency: 'monthly' },
    ];
    expect(component.totalIncome).toBe(3000);
  });

  // Test 1: should display current month as default selected month
  it('should display current month as default selected month', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    fixture.detectChanges();
    expect(component.selectedMonth).toBe(expected);
    const picker = fixture.nativeElement.querySelector('.month-picker') as HTMLInputElement;
    expect(picker).toBeTruthy();
    expect(picker.value).toBe(expected);
  });
});
