import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { EmergencyFundComponent } from './emergency-fund.component';
import { MoneyService } from '../core/services/money.service';
import { SavingsGoal, Expense } from '../core/models/money.models';

describe('EmergencyFundComponent', () => {
  let component: EmergencyFundComponent;
  let fixture: ComponentFixture<EmergencyFundComponent>;
  let mockMoneyService: {
    getSavingsGoals: jasmine.Spy;
    getExpenses: jasmine.Spy;
    createSavingsGoal: jasmine.Spy;
    updateSavingsGoal: jasmine.Spy;
  };

  const mockGoals: SavingsGoal[] = [
    {
      id: 'goal-1',
      household_id: 'hh-1',
      name: 'Emergency Fund',
      target_amount: 3000,
      current_amount: 1500,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      amount: 500,
      date: '2026-06-01',
      is_recurring: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
    {
      id: 'exp-2',
      household_id: 'hh-1',
      user_id: 'user-1',
      amount: 500,
      date: '2026-06-02',
      is_recurring: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ];

  beforeEach(async () => {
    mockMoneyService = {
      getSavingsGoals: jasmine.createSpy('getSavingsGoals').and.returnValue(of(mockGoals)),
      getExpenses: jasmine.createSpy('getExpenses').and.returnValue(of(mockExpenses)),
      createSavingsGoal: jasmine.createSpy('createSavingsGoal').and.returnValue(of(mockGoals[0])),
      updateSavingsGoal: jasmine.createSpy('updateSavingsGoal').and.returnValue(of(mockGoals[0])),
    };

    await TestBed.configureTestingModule({
      imports: [EmergencyFundComponent, HttpClientTestingModule, ReactiveFormsModule, FormsModule],
      providers: [
        { provide: MoneyService, useValue: mockMoneyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmergencyFundComponent);
    component = fixture.componentInstance;
  });

  // Test 1: should display loading state until both goals and expenses resolve
  it('should display loading state until both goals and expenses resolve', () => {
    const goalsSubject = new Subject<SavingsGoal[]>();
    const expensesSubject = new Subject<Expense[]>();
    mockMoneyService.getSavingsGoals.and.returnValue(goalsSubject.asObservable());
    mockMoneyService.getExpenses.and.returnValue(expensesSubject.asObservable());

    fixture.detectChanges();
    const loadingEl = fixture.nativeElement.querySelector('.loading');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl.textContent).toContain('Loading');

    goalsSubject.complete();
    expensesSubject.complete();
  });

  // Test 2: should compute monthlyExpenses as sum of all expense amounts
  it('should compute monthlyExpenses as sum of all expense amounts', () => {
    fixture.detectChanges();
    // mockExpenses: 500 + 500 = 1000
    expect(component.monthlyExpenses).toBe(1000);
  });

  // Test 3: should compute autoTarget as monthlyExpenses * 3
  it('should compute autoTarget as monthlyExpenses * 3', () => {
    fixture.detectChanges();
    expect(component.autoTarget).toBe(3000); // 1000 * 3
  });

  // Test 4: should compute progressPercent capped at 100
  it('should compute progressPercent capped at 100 when current_amount exceeds target', () => {
    fixture.detectChanges();
    // Override goal to have current_amount > target
    component.goal = { ...mockGoals[0], current_amount: 5000, target_amount: 3000 };
    component.currentAmountControl.setValue(5000);
    expect(component.progressPercent).toBe(100);
  });

  // Test 5: should compute progressPercent proportionally when under target
  it('should compute progressPercent proportionally when under target', () => {
    fixture.detectChanges();
    // goal: current=1500, target=3000 → 50%
    expect(component.progressPercent).toBeCloseTo(50, 1);
  });

  // Test 6: should compute monthsCovered correctly
  it('should compute monthsCovered as current_amount / monthlyExpenses', () => {
    fixture.detectChanges();
    // current_amount = 1500, monthlyExpenses = 1000 → 1.5
    expect(component.monthsCovered).toBeCloseTo(1.5, 1);
  });

  // Test 7: should display goal name "Emergency Fund" and progress bar in template
  it('should display "Emergency Fund" heading and progress bar in template', () => {
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('h2, h1, .page-title');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toContain('Emergency Fund');
    const progressBar = fixture.nativeElement.querySelector('.progress-bar, .progress-fill');
    expect(progressBar).toBeTruthy();
  });

  // Test 8: should call updateSavingsGoal when goal exists and save() is called
  it('should call updateSavingsGoal when goal exists and save() is called', () => {
    fixture.detectChanges();
    component.currentAmountControl.setValue(2000);
    component.save();
    expect(mockMoneyService.updateSavingsGoal).toHaveBeenCalledWith('goal-1', {
      current_amount: 2000,
      target_amount: component.effectiveTarget,
    });
  });

  // Test 9: should call createSavingsGoal when no goal exists and save() is called
  it('should call createSavingsGoal when no goal exists and save() is called', () => {
    mockMoneyService.getSavingsGoals.and.returnValue(of([]));
    fixture.detectChanges();
    component.currentAmountControl.setValue(500);
    component.save();
    expect(mockMoneyService.createSavingsGoal).toHaveBeenCalledWith({
      name: 'Emergency Fund',
      target_amount: component.effectiveTarget,
      current_amount: 500,
    });
  });
});
