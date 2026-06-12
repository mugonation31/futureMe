import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, Subject } from 'rxjs';
import { DebtsComponent } from './debts.component';
import { MoneyService } from '../core/services/money.service';
import { Debt } from '../core/models/money.models';

describe('DebtsComponent', () => {
  let component: DebtsComponent;
  let fixture: ComponentFixture<DebtsComponent>;
  let mockMoneyService: {
    getDebts: jasmine.Spy;
    createDebt: jasmine.Spy;
    deleteDebt: jasmine.Spy;
  };

  const mockDebts: Debt[] = [
    {
      id: 'debt-1',
      household_id: 'hh-1',
      user_id: 'user-1',
      name: 'Credit Card',
      balance: 1500,
      interest_rate: 19.9,
      minimum_payment: 30,
      target_payoff_date: '2027-06-01',
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

  beforeEach(async () => {
    mockMoneyService = {
      getDebts: jasmine.createSpy('getDebts').and.returnValue(of(mockDebts)),
      createDebt: jasmine.createSpy('createDebt').and.returnValue(of(mockDebts[0])),
      deleteDebt: jasmine.createSpy('deleteDebt').and.returnValue(of(void 0)),
    };

    await TestBed.configureTestingModule({
      imports: [DebtsComponent, RouterTestingModule, HttpClientTestingModule, ReactiveFormsModule],
      providers: [
        { provide: MoneyService, useValue: mockMoneyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DebtsComponent);
    component = fixture.componentInstance;
  });

  // Test 1: should display debts list from service
  it('should display debts list from service', () => {
    fixture.detectChanges();
    expect(component.debts).toEqual(mockDebts);
    const cards = fixture.nativeElement.querySelectorAll('.debt-card');
    expect(cards.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Credit Card');
    expect(fixture.nativeElement.textContent).toContain('Car Loan');
  });

  // Test 2: should display loading state initially
  it('should display loading state initially', () => {
    const debtsSubject = new Subject<Debt[]>();
    mockMoneyService.getDebts.and.returnValue(debtsSubject.asObservable());
    fixture.detectChanges();
    const loadingEl = fixture.nativeElement.querySelector('.loading');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl.textContent).toContain('Loading');
    debtsSubject.complete();
  });

  // Test 3: should compute totalOwed as sum of all debt balances
  it('should compute totalOwed as sum of all debt balances', () => {
    fixture.detectChanges();
    expect(component.totalOwed).toBe(10000); // 1500 + 8500
  });

  // Test 4: should compute totalMinimumPayments as sum of all minimum_payments
  it('should compute totalMinimumPayments as sum of all minimum_payments', () => {
    fixture.detectChanges();
    expect(component.totalMinimumPayments).toBe(230); // 30 + 200
  });

  // Test 5: should show add form when button clicked
  it('should show add form when "+ Add Debt" button is clicked', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inline-form')).toBeNull();
    const addBtn = fixture.nativeElement.querySelector('.btn-add');
    addBtn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inline-form')).toBeTruthy();
  });

  // Test 6: should call createDebt when form submitted
  it('should call createDebt when form is submitted with valid data', () => {
    fixture.detectChanges();
    component.showAddForm = true;
    fixture.detectChanges();

    component.debtForm.setValue({
      name: 'Student Loan',
      balance: 12000,
      interest_rate: 3.5,
      minimum_payment: 100,
      target_payoff_date: '',
    });
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.inline-form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(mockMoneyService.createDebt).toHaveBeenCalledWith({
      name: 'Student Loan',
      balance: 12000,
      interest_rate: 3.5,
      minimum_payment: 100,
      target_payoff_date: undefined,
    });
  });

  // Test 7: should call deleteDebt when delete button clicked
  it('should call deleteDebt when delete button clicked', () => {
    fixture.detectChanges();
    const deleteBtn = fixture.nativeElement.querySelector('.btn-delete');
    deleteBtn.click();
    fixture.detectChanges();
    expect(mockMoneyService.deleteDebt).toHaveBeenCalledWith('debt-1');
  });

  // Test 8: should show empty state when no debts
  it('should show empty state when no debts', () => {
    mockMoneyService.getDebts.and.returnValue(of([]));
    fixture.detectChanges();
    const emptyEl = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl.textContent).toContain('No debts added');
  });

  // Test 9: should display interest rate and minimum payment on each card
  it('should display interest rate and minimum payment on each card', () => {
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.debt-card');
    expect(cards[0].textContent).toContain('19.9% APR');
    expect(cards[0].textContent).toContain('/mo min');
    expect(cards[1].textContent).toContain('5.5% APR');
    expect(cards[1].textContent).toContain('/mo min');
  });
});
