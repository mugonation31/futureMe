import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { BudgetAllocationComponent } from './budget-allocation.component';
import { TransactionService } from '../../../transactions/services/transaction.service';
import { Category } from '../../../transactions/models/transaction.model';
import { CategoryBudget } from '../../../transactions/models/transaction.model';

describe('BudgetAllocationComponent', () => {
  let component: BudgetAllocationComponent;
  let fixture: ComponentFixture<BudgetAllocationComponent>;
  let mockTransactionService: {
    getCategories: jasmine.Spy;
    getBudgets: jasmine.Spy;
    upsertBudget: jasmine.Spy;
    deleteBudget: jasmine.Spy;
  };

  const mockCategories: Category[] = [
    { id: 'cat-1', household_id: 'hh-1', name: 'Groceries', icon: null, color: null, is_default: false },
    { id: 'cat-2', household_id: 'hh-1', name: 'Transport', icon: null, color: null, is_default: false },
  ];

  const mockBudgets: CategoryBudget[] = [
    {
      id: 'budget-1',
      household_id: 'hh-1',
      category_id: 'cat-1',
      category_name: 'Groceries',
      monthly_limit: 300,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockTransactionService = {
      getCategories: jasmine.createSpy('getCategories').and.returnValue(of(mockCategories)),
      getBudgets: jasmine.createSpy('getBudgets').and.returnValue(of(mockBudgets)),
      upsertBudget: jasmine.createSpy('upsertBudget').and.returnValue(of(mockBudgets[0])),
      deleteBudget: jasmine.createSpy('deleteBudget').and.returnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [BudgetAllocationComponent],
      providers: [
        { provide: TransactionService, useValue: mockTransactionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetAllocationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 4 — should create
  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // Test 5 — should fetch categories and budgets in parallel on init
  it('should call getCategories and getBudgets on init', () => {
    expect(mockTransactionService.getCategories).toHaveBeenCalled();
    expect(mockTransactionService.getBudgets).toHaveBeenCalled();
  });

  // Test 6 — should build rows combining each category with its matching budget limit
  it('should build rows with category and matching budget limit', () => {
    expect(component.rows.length).toBe(2);
    expect(component.rows[0].category.id).toBe('cat-1');
    expect(component.rows[0].limit).toBe('300');
  });

  // Test 7 — should pre-fill limit as empty string when no budget exists for a category
  it('should set limit to empty string when no budget exists for a category', () => {
    const transportRow = component.rows.find(r => r.category.id === 'cat-2');
    expect(transportRow).toBeDefined();
    expect(transportRow!.limit).toBe('');
  });

  // Test 8 — should call upsertBudget when limit is non-empty and differs from originalLimit
  it('should call upsertBudget for rows where limit changed', () => {
    // Arrange: change cat-1 limit
    component.rows[0].limit = '400';

    // Act
    component.onSave();

    // Assert
    expect(mockTransactionService.upsertBudget).toHaveBeenCalledWith('cat-1', 400);
  });

  // Test 9 — should call deleteBudget when limit cleared but originalLimit was non-empty
  it('should call deleteBudget when limit is cleared but originalLimit was non-empty', () => {
    // Arrange: cat-1 had budget 300, clear it
    component.rows[0].limit = '';

    // Act
    component.onSave();

    // Assert
    expect(mockTransactionService.deleteBudget).toHaveBeenCalledWith('cat-1');
  });

  // Test 10 — should skip row when limit is empty and originalLimit was also empty
  it('should not call upsertBudget or deleteBudget when limit is empty and originalLimit is empty', () => {
    // Arrange: cat-2 has no budget and limit stays empty
    component.rows[1].limit = '';

    // Act
    component.onSave();

    // Assert
    expect(mockTransactionService.deleteBudget).not.toHaveBeenCalledWith('cat-2');
    expect(mockTransactionService.upsertBudget).not.toHaveBeenCalledWith('cat-2', jasmine.anything());
  });

  // Test 11 — should show loading state while save is in progress
  it('should set saving to true while save is in progress', fakeAsync(() => {
    // Arrange: make upsertBudget return an observable that hasn't completed yet
    let resolveUpsert!: (v: CategoryBudget) => void;
    mockTransactionService.upsertBudget.and.returnValue(
      new Observable((obs) => {
        resolveUpsert = (v: CategoryBudget) => { obs.next(v); obs.complete(); };
      })
    );
    component.rows[0].limit = '500';

    // Act
    component.onSave();

    // Assert saving = true during the call
    expect(component.saving).toBeTrue();

    // Resolve and check saving = false
    resolveUpsert(mockBudgets[0]);
    tick();
    expect(component.saving).toBeFalse();
  }));

  // Test 12 — should show error and roll back on save failure
  it('should show error message and roll back to originalLimit values on save failure', fakeAsync(() => {
    // Arrange
    mockTransactionService.upsertBudget.and.returnValue(throwError(() => new Error('Network error')));
    component.rows[0].limit = '999';
    const originalLimit = component.rows[0].originalLimit; // '300'

    // Act
    component.onSave();
    tick();

    // Assert
    expect(component.errorMessage).toBeTruthy();
    expect(component.rows[0].limit).toBe(originalLimit);
  }));
});
