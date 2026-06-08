import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TransactionFormComponent } from './transaction-form.component';
import { TransactionService } from '../../services/transaction.service';
import { Transaction } from '../../models/transaction.model';

const MOCK_TRANSACTION: Transaction = {
  id: 'txn-1',
  household_id: 'hh-1',
  user_id: 'u-1',
  category_id: null,
  category_name: null,
  amount: 55.00,
  type: 'expense',
  description: 'Test',
  date: '2026-06-01',
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};

describe('TransactionFormComponent', () => {
  let component: TransactionFormComponent;
  let fixture: ComponentFixture<TransactionFormComponent>;
  let mockService: {
    getCategories: jasmine.Spy;
    createTransaction: jasmine.Spy;
  };

  beforeEach(async () => {
    mockService = {
      getCategories: jasmine.createSpy('getCategories').and.returnValue(of([])),
      createTransaction: jasmine.createSpy('createTransaction').and.returnValue(of(MOCK_TRANSACTION)),
    };

    await TestBed.configureTestingModule({
      imports: [TransactionFormComponent],
      providers: [
        { provide: TransactionService, useValue: mockService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 8: form component creation
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 9: amount validation
  it('should mark amount as invalid when it is 0', () => {
    // Arrange / Act
    const amountControl = component.form.get('amount')!;
    amountControl.setValue(0);
    amountControl.markAsTouched();
    fixture.detectChanges();

    // Assert
    expect(amountControl.invalid).toBeTrue();
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('span.error');
    expect(errorEl).not.toBeNull();
  });

  // Test 10: (saved) output event emitted after success
  it('should emit (saved) output event after createTransaction() succeeds', () => {
    // Arrange
    let emitted = false;
    component.saved.subscribe(() => { emitted = true; });
    component.form.setValue({ amount: 55.00, type: 'expense', description: 'Test', date: '2026-06-01', category_id: null });

    // Act
    component.onSubmit();

    // Assert
    expect(emitted).toBeTrue();
  });

  // Test 11: createTransaction called with form values
  it('should call createTransaction() with the form values on submit', () => {
    // Arrange
    component.form.setValue({ amount: 99.99, type: 'income', description: 'Bonus', date: '2026-06-15', category_id: null });

    // Act
    component.onSubmit();

    // Assert
    expect(mockService.createTransaction).toHaveBeenCalledWith(
      jasmine.objectContaining({ amount: 99.99, type: 'income', description: 'Bonus' })
    );
  });
});
