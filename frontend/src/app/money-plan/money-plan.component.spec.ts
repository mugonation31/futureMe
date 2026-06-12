import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MoneyPlanComponent } from './money-plan.component';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense } from '../core/models/money.models';

describe('MoneyPlanComponent', () => {
  let component: MoneyPlanComponent;
  let fixture: ComponentFixture<MoneyPlanComponent>;
  let mockMoneyService: {
    getIncome: jasmine.Spy;
    getExpenses: jasmine.Spy;
    createIncome: jasmine.Spy;
    deleteIncome: jasmine.Spy;
    createExpense: jasmine.Spy;
    deleteExpense: jasmine.Spy;
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
      createIncome: jasmine.createSpy('createIncome').and.returnValue(of(mockIncomeList[0])),
      deleteIncome: jasmine.createSpy('deleteIncome').and.returnValue(of(void 0)),
      createExpense: jasmine.createSpy('createExpense').and.returnValue(of(mockExpenseList[0])),
      deleteExpense: jasmine.createSpy('deleteExpense').and.returnValue(of(void 0)),
    };

    await TestBed.configureTestingModule({
      imports: [MoneyPlanComponent, HttpClientTestingModule],
      providers: [
        { provide: MoneyService, useValue: mockMoneyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MoneyPlanComponent);
    component = fixture.componentInstance;
  });

  // Test 1: should display income list from service
  it('should display income list from service', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Salary');
  });

  // Test 2: should display expenses list from service
  it('should display expenses list from service', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Groceries');
  });

  // Test 3: should compute totalMonthlyIncome: weekly income normalised to monthly
  it('should compute totalMonthlyIncome: weekly income normalised to monthly', () => {
    component.income = [
      { ...mockIncomeList[0], amount: 500, frequency: 'weekly' },
    ];
    const expected = (500 * 52) / 12;
    expect(component.totalMonthlyIncome).toBeCloseTo(expected, 1);
  });

  // Test 4: should compute totalMonthlyIncome: annual income normalised to monthly
  it('should compute totalMonthlyIncome: annual income normalised to monthly', () => {
    component.income = [
      { ...mockIncomeList[0], amount: 36000, frequency: 'annual' },
    ];
    expect(component.totalMonthlyIncome).toBeCloseTo(3000, 1);
  });

  // Test 5: should compute surplus as income minus expenses
  it('should compute surplus as income minus expenses', () => {
    component.income = [{ ...mockIncomeList[0], amount: 3000, frequency: 'monthly' }];
    component.expenses = [{ ...mockExpenseList[0], amount: 1200 }];
    expect(component.surplus).toBe(1800);
  });

  // Test 6: should show surplus class 'positive' when surplus >= 0
  it("should show surplus class 'positive' when surplus >= 0", () => {
    // income 3000/month, expenses 1000 → surplus 2000 (positive)
    mockMoneyService.getIncome.and.returnValue(of([
      { ...mockIncomeList[0], amount: 3000, frequency: 'monthly' },
    ]));
    mockMoneyService.getExpenses.and.returnValue(of([
      { ...mockExpenseList[0], amount: 1000 },
    ]));
    fixture.detectChanges();
    const surplusValueEl = fixture.nativeElement.querySelector('.summary-bar .value.positive');
    expect(surplusValueEl).toBeTruthy();
  });

  // Test 7: should show surplus class 'caution' when deficit
  it("should show surplus class 'caution' when deficit", () => {
    // income 500/month, expenses 2000 → deficit (surplus < 0)
    mockMoneyService.getIncome.and.returnValue(of([
      { ...mockIncomeList[0], amount: 500, frequency: 'monthly' },
    ]));
    mockMoneyService.getExpenses.and.returnValue(of([
      { ...mockExpenseList[0], amount: 2000 },
    ]));
    fixture.detectChanges();
    const cautionEl = fixture.nativeElement.querySelector('.summary-bar .value.caution');
    expect(cautionEl).toBeTruthy();
  });

  // Test 8: should call createIncome when income form submitted
  it('should call createIncome when income form submitted', () => {
    fixture.detectChanges();
    component.incomeForm.setValue({ source: 'Freelance', amount: 500, frequency: 'monthly' });
    component.addIncome();
    expect(mockMoneyService.createIncome).toHaveBeenCalledWith({
      source: 'Freelance',
      amount: 500,
      frequency: 'monthly',
    });
  });

  // Test 9: should call deleteIncome when delete button clicked
  it('should call deleteIncome when delete button clicked', () => {
    fixture.detectChanges();
    component.deleteIncome('inc-1');
    expect(mockMoneyService.deleteIncome).toHaveBeenCalledWith('inc-1');
  });

  // Test 10: should toggle add income form visibility
  it('should toggle add income form visibility', () => {
    fixture.detectChanges();
    expect(component.showAddIncome).toBeFalse();
    const addButton = fixture.nativeElement.querySelector('.btn-add');
    addButton.click();
    fixture.detectChanges();
    expect(component.showAddIncome).toBeTrue();
    const form = fixture.nativeElement.querySelector('.inline-form');
    expect(form).toBeTruthy();
  });
});
