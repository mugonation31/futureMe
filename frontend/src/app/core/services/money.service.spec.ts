import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MoneyService } from './money.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import {
  Account,
  AccountCreate,
  IncomeEntry,
  IncomeCreate,
  Expense,
  Debt,
  DebtCreate,
  SavingsGoal,
} from '../models/money.models';

describe('MoneyService', () => {
  let service: MoneyService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  const mockAccount: Account = {
    id: 'acc-1',
    household_id: 'hh-1',
    name: 'Main Checking',
    type: 'checking',
    balance: 1500,
    currency: 'GBP',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockIncome: IncomeEntry = {
    id: 'inc-1',
    household_id: 'hh-1',
    user_id: 'user-1',
    source: 'Salary',
    amount: 3000,
    frequency: 'monthly',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockExpense: Expense = {
    id: 'exp-1',
    household_id: 'hh-1',
    user_id: 'user-1',
    category: 'Groceries',
    description: 'Weekly shop',
    amount: 100,
    date: '2026-06-01',
    is_recurring: false,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockDebt: Debt = {
    id: 'debt-1',
    household_id: 'hh-1',
    user_id: 'user-1',
    name: 'Car Loan',
    balance: 5000,
    interest_rate: 5.5,
    minimum_payment: 150,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockSavingsGoal: SavingsGoal = {
    id: 'sg-1',
    household_id: 'hh-1',
    name: 'Holiday Fund',
    target_amount: 2000,
    current_amount: 500,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MoneyService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(MoneyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Test 1
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Test 2
  it('should use environment.apiUrl directly without a fallback', () => {
    const apiUrl = (service as any)['apiUrl'];
    expect(apiUrl).toBe(environment.apiUrl);
  });

  // Test 3
  it('should call GET /api/accounts with auth headers on getAccounts()', (done: DoneFn) => {
    service.getAccounts().subscribe(accounts => {
      expect(accounts).toEqual([mockAccount]);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/accounts'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush([mockAccount]);
    });
  });

  // Test 4
  it('should call POST /api/accounts with body on createAccount()', (done: DoneFn) => {
    const payload: AccountCreate = { name: 'Main Checking', type: 'checking', balance: 1500, currency: 'GBP' };

    service.createAccount(payload).subscribe(account => {
      expect(account).toEqual(mockAccount);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/accounts'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockAccount);
    });
  });

  // Test 5
  it('should call PATCH /api/accounts/{id} with body on updateAccount()', (done: DoneFn) => {
    const update: Partial<AccountCreate> = { balance: 2000 };

    service.updateAccount('acc-1', update).subscribe(account => {
      expect(account).toEqual({ ...mockAccount, balance: 2000 });
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/accounts/acc-1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(update);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush({ ...mockAccount, balance: 2000 });
    });
  });

  // Test 6
  it('should call DELETE /api/accounts/{id} on deleteAccount()', (done: DoneFn) => {
    service.deleteAccount('acc-1').subscribe(() => {
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/accounts/acc-1'));
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(null);
    });
  });

  // Test 7
  it('should call GET /api/income with auth headers on getIncome()', (done: DoneFn) => {
    service.getIncome().subscribe(income => {
      expect(income).toEqual([mockIncome]);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/income'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush([mockIncome]);
    });
  });

  // Test 8
  it('should call POST /api/income with body on createIncome()', (done: DoneFn) => {
    const payload: IncomeCreate = { source: 'Salary', amount: 3000, frequency: 'monthly' };

    service.createIncome(payload).subscribe(income => {
      expect(income).toEqual(mockIncome);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/income'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockIncome);
    });
  });

  // Test 9
  it('should call GET /api/expenses with auth headers on getExpenses()', (done: DoneFn) => {
    service.getExpenses().subscribe(expenses => {
      expect(expenses).toEqual([mockExpense]);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/expenses'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush([mockExpense]);
    });
  });

  // Test 10
  it('should call GET /api/debts with auth headers on getDebts()', (done: DoneFn) => {
    service.getDebts().subscribe(debts => {
      expect(debts).toEqual([mockDebt]);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/debts'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush([mockDebt]);
    });
  });

  // Test 11
  it('should call POST /api/debts with body on createDebt()', (done: DoneFn) => {
    const payload: DebtCreate = { name: 'Car Loan', balance: 5000, interest_rate: 5.5, minimum_payment: 150 };

    service.createDebt(payload).subscribe(debt => {
      expect(debt).toEqual(mockDebt);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/debts'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockDebt);
    });
  });

  // Test 12
  it('should call GET /api/savings-goals with auth headers on getSavingsGoals()', (done: DoneFn) => {
    service.getSavingsGoals().subscribe(goals => {
      expect(goals).toEqual([mockSavingsGoal]);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/savings-goals'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush([mockSavingsGoal]);
    });
  });

  // Test 13: getHeaders() still throws synchronously (private method guard)
  it('should throw "No auth token available" when getToken() returns null (getHeaders direct call)', () => {
    // Arrange
    mockAuthService.getToken.and.returnValue(null);

    // Act & Assert
    expect(() => (service as any)['getHeaders']()).toThrowError('No auth token available');
  });

  // Test 14: public methods return Observable error (not throw) when token is null
  it('should return an Observable error (not throw synchronously) from getAccounts() when token is null', (done: DoneFn) => {
    // Arrange
    mockAuthService.getToken.and.returnValue(null);

    // Act — should NOT throw, should return an observable that errors
    let threwSynchronously = false;
    let obs: any;
    try {
      obs = service.getAccounts();
    } catch {
      threwSynchronously = true;
    }

    expect(threwSynchronously).toBeFalse();
    obs.subscribe({
      next: () => fail('should not emit'),
      error: (err: Error) => {
        expect(err.message).toBe('No auth token available');
        done();
      },
    });
  });
});
