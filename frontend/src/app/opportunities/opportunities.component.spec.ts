import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { OpportunitiesComponent } from './opportunities.component';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense, Debt, SavingsGoal } from '../core/models/money.models';

describe('OpportunitiesComponent', () => {
  let component: OpportunitiesComponent;
  let fixture: ComponentFixture<OpportunitiesComponent>;
  let mockMoneyService: {
    getIncome: jasmine.Spy;
    getExpenses: jasmine.Spy;
    getDebts: jasmine.Spy;
    getSavingsGoals: jasmine.Spy;
  };

  const mockIncome: IncomeEntry[] = [
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

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      amount: 1800,
      date: '2026-06-01',
      is_recurring: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  const mockDebts: Debt[] = [
    {
      id: 'debt-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      name: 'Credit Card',
      balance: 1500,
      interest_rate: 19.9,
      minimum_payment: 30,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
    {
      id: 'debt-2',
      household_id: 'hh-1',
      user_id: 'user-1',
      name: 'Car Loan',
      balance: 8500,
      interest_rate: 5.5,
      minimum_payment: 200,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  const mockSavingsGoals: SavingsGoal[] = [
    {
      id: 'goal-1',
      household_id: 'hh-1',
      name: 'Emergency Fund',
      target_amount: 9000,
      current_amount: 3000,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
    {
      id: 'goal-2',
      household_id: 'hh-1',
      name: 'Holiday',
      target_amount: 2000,
      current_amount: 1800,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  beforeEach(async () => {
    mockMoneyService = {
      getIncome: jasmine.createSpy('getIncome').and.returnValue(of(mockIncome)),
      getExpenses: jasmine.createSpy('getExpenses').and.returnValue(of(mockExpenses)),
      getDebts: jasmine.createSpy('getDebts').and.returnValue(of(mockDebts)),
      getSavingsGoals: jasmine.createSpy('getSavingsGoals').and.returnValue(of(mockSavingsGoals)),
    };

    await TestBed.configureTestingModule({
      imports: [OpportunitiesComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [
        { provide: MoneyService, useValue: mockMoneyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OpportunitiesComponent);
    component = fixture.componentInstance;
  });

  // Test 1: should display surplus from income minus expenses
  it('should display surplus from income minus expenses', () => {
    fixture.detectChanges();
    // income: 3000 monthly, expenses: 1800 => surplus: 1200
    expect(component.totalMonthlyIncome).toBe(3000);
    expect(component.totalMonthlyExpenses).toBe(1800);
    expect(component.surplus).toBe(1200);
    const amountEl = fixture.nativeElement.querySelector('.amount');
    expect(amountEl.textContent).toContain('1,200');
  });

  // Test 7: should not show suggestions section when surplus is zero
  it('should not show suggestions section when surplus is zero', () => {
    mockMoneyService.getExpenses.and.returnValue(of([
      {
        id: 'exp-zero',
        household_id: 'hh-1',
        user_id: 'user-1',
        amount: 3000, // exactly matches income
        date: '2026-06-01',
        is_recurring: false,
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-01T00:00:00',
      },
    ]));
    fixture.detectChanges();
    expect(component.surplus).toBe(0);
    // The "Where to put it" section should not be visible
    const sectionTitle = fixture.nativeElement.querySelector('.section-title');
    expect(sectionTitle).toBeNull();
  });

  // Test 6: should return empty suggestions when all goals met
  it('should return empty suggestions when all goals met', () => {
    // No debts, emergency fund full, no other savings goals
    mockMoneyService.getDebts.and.returnValue(of([]));
    mockMoneyService.getSavingsGoals.and.returnValue(of([
      {
        id: 'goal-1',
        household_id: 'hh-1',
        name: 'Emergency Fund',
        target_amount: 9000,
        current_amount: 9000, // full
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-01T00:00:00',
      },
    ]));
    fixture.detectChanges();
    expect(component.surplus).toBeGreaterThan(0);
    expect(component.suggestions.length).toBe(0);
    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('All goals are on track');
  });

  // Test 5: should suggest boosting closest savings goal (smallest remaining gap appears first)
  it('should suggest the goal with the smallest remaining gap first', () => {
    // Add a second non-emergency goal that is further away than Holiday
    mockMoneyService.getSavingsGoals.and.returnValue(of([
      ...mockSavingsGoals,
      {
        id: 'goal-3',
        household_id: 'hh-1',
        name: 'New Car',
        target_amount: 10000,
        current_amount: 0,   // 10000 away — furthest
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-01T00:00:00',
      },
    ]));
    fixture.detectChanges();
    // Holiday: 200 away, New Car: 10000 away — Holiday must be first
    const suggestions = component.suggestions;
    const goalSuggestion = suggestions.find(s => s.routerLink === '/money-plan');
    expect(goalSuggestion).toBeTruthy();
    expect(goalSuggestion!.title).toContain('Holiday');
    expect(goalSuggestion!.routerLink).toBe('/money-plan');
    expect(goalSuggestion!.amount).toBeGreaterThan(0);
  });

  // Test 4: should suggest extra debt payment for highest-interest debt (and surplus > 0)
  it('should suggest extra debt payment for highest-interest debt (and surplus > 0)', () => {
    fixture.detectChanges();
    // debts: Credit Card 19.9% and Car Loan 5.5% — highest is Credit Card
    const suggestions = component.suggestions;
    const debtSuggestion = suggestions.find(s => s.routerLink === '/debts');
    expect(debtSuggestion).toBeTruthy();
    expect(debtSuggestion!.title).toContain('Credit Card');
    expect(debtSuggestion!.description).toContain('19.9%');
  });

  // Test 3: should suggest topping up emergency fund when below target (and surplus > 0)
  it('should suggest topping up emergency fund when below target (and surplus > 0)', () => {
    fixture.detectChanges();
    // surplus = 1200, emergency fund 3000 of 9000
    const suggestions = component.suggestions;
    const efSuggestion = suggestions.find(s => s.routerLink === '/emergency-fund');
    expect(efSuggestion).toBeTruthy();
    expect(efSuggestion!.title).toContain('Emergency Fund');
    expect(efSuggestion!.amount).toBeGreaterThan(0);
  });

  // Test 2: should show no-surplus message when surplus <= 0
  it('should show no-surplus message when surplus <= 0', () => {
    mockMoneyService.getExpenses.and.returnValue(of([
      {
        id: 'exp-2',
        household_id: 'hh-1',
        user_id: 'user-1',
        amount: 3500,
        date: '2026-06-01',
        is_recurring: false,
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-01T00:00:00',
      },
    ]));
    fixture.detectChanges();
    expect(component.surplus).toBeLessThanOrEqual(0);
    const noSurplusMsg = fixture.nativeElement.querySelector('.no-surplus-msg');
    expect(noSurplusMsg).toBeTruthy();
    expect(noSurplusMsg.textContent).toContain('No surplus this month');
  });
});
