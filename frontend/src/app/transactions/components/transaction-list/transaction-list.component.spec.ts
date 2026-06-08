import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { TransactionListComponent } from './transaction-list.component';
import { TransactionService } from '../../services/transaction.service';
import { Transaction } from '../../models/transaction.model';

const MOCK_EXPENSE: Transaction = {
  id: 'txn-1',
  household_id: 'hh-1',
  user_id: 'u-1',
  category_id: 'cat-1',
  category_name: 'Groceries',
  amount: 55.00,
  type: 'expense',
  description: 'Weekly shop',
  date: '2026-06-01',
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};

const MOCK_INCOME: Transaction = {
  id: 'txn-2',
  household_id: 'hh-1',
  user_id: 'u-1',
  category_id: null,
  category_name: null,
  amount: 3000.00,
  type: 'income',
  description: 'Salary',
  date: '2026-06-01',
  created_at: '2026-06-01T09:00:00Z',
  updated_at: '2026-06-01T09:00:00Z',
};

describe('TransactionListComponent', () => {
  let component: TransactionListComponent;
  let fixture: ComponentFixture<TransactionListComponent>;
  let mockService: {
    getTransactions: jasmine.Spy;
    getCategories: jasmine.Spy;
    deleteTransaction: jasmine.Spy;
    createTransaction: jasmine.Spy;
  };

  beforeEach(async () => {
    mockService = {
      getTransactions: jasmine.createSpy('getTransactions').and.returnValue(of([MOCK_EXPENSE, MOCK_INCOME])),
      getCategories: jasmine.createSpy('getCategories').and.returnValue(of([])),
      deleteTransaction: jasmine.createSpy('deleteTransaction').and.returnValue(of(null)),
      createTransaction: jasmine.createSpy('createTransaction').and.returnValue(of(MOCK_EXPENSE)),
    };

    await TestBed.configureTestingModule({
      imports: [TransactionListComponent, RouterTestingModule],
      providers: [
        { provide: TransactionService, useValue: mockService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionListComponent);
    component = fixture.componentInstance;
  });

  // Test 1: component creation
  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // Test 2: loads transactions on init
  it('should call getTransactions() on init and render rows', () => {
    // Act
    fixture.detectChanges();

    // Assert — service was called
    expect(mockService.getTransactions).toHaveBeenCalled();
    // Assert — rows are rendered
    const rows: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('[data-testid="transaction-row"]');
    expect(rows.length).toBe(2);
  });

  // Test 3: month selector re-fetches
  it('should call getTransactions with new month when month selector changes', () => {
    // Arrange
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('[data-testid="month-selector"]');

    // Act
    select.value = '2026-05';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Assert
    expect(mockService.getTransactions).toHaveBeenCalledWith('2026-05');
  });

  // Test 4: add-transaction form toggles
  it('should show the inline form when "Add Transaction" button is clicked', () => {
    // Arrange
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="add-transaction-btn"]');

    // Act
    btn.click();
    fixture.detectChanges();

    // Assert
    const form = fixture.nativeElement.querySelector('[data-testid="transaction-form"]');
    expect(form).not.toBeNull();
  });

  // Test 5: delete removes a row
  it('should call deleteTransaction() when delete button is clicked', () => {
    // Arrange
    fixture.detectChanges();
    spyOn(window, 'confirm').and.returnValue(true);
    const deleteBtn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="delete-btn"]');

    // Act
    deleteBtn.click();
    fixture.detectChanges();

    // Assert
    expect(mockService.deleteTransaction).toHaveBeenCalledWith('txn-1');
  });

  // Test 6: expense amount has expense CSS class
  it('should apply expense CSS class to expense transaction amounts', () => {
    // Arrange / Act
    fixture.detectChanges();

    // Assert
    const expenseAmounts: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.amount-expense');
    expect(expenseAmounts.length).toBeGreaterThanOrEqual(1);
  });

  // Test 7: income amount has income CSS class
  it('should apply income CSS class to income transaction amounts', () => {
    // Arrange / Act
    fixture.detectChanges();

    // Assert
    const incomeAmounts: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.amount-income');
    expect(incomeAmounts.length).toBeGreaterThanOrEqual(1);
  });
});
