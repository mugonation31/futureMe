import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BudgetService } from './budget.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import {
  BudgetResponse,
  IncomeStream,
  LineItem,
  IncomeStreamCreate,
  IncomeStreamUpdate,
  LineItemCreate,
  LineItemUpdate,
  BudgetGoalsUpdate,
} from '../models/budget.models';

describe('BudgetService', () => {
  let service: BudgetService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  const mockIncome: IncomeStream = {
    id: 'inc-1',
    budget_id: 'bud-1',
    label: 'Salary',
    amount: 3000,
    position: 0,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockLineItem: LineItem = {
    id: 'li-1',
    budget_id: 'bud-1',
    bucket: 'fundamentals',
    label: 'Rent',
    amount: 1200,
    position: 0,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockBudget: BudgetResponse = {
    id: 'bud-1',
    scope: 'household',
    user_id: null,
    household_id: 'hh-1',
    month: '2026-01-01',
    currency: 'GBP',
    goals: {
      fundamentals_goal_pct: 50,
      future_you_goal_pct: 20,
      fun_goal_pct: 30,
    },
    total_income: 3000,
    income_streams: [mockIncome],
    buckets: {
      fundamentals: {
        line_items: [mockLineItem],
        dashboard: {
          bucket: 'fundamentals',
          goal_pct: 50,
          ideal_amount: 1500,
          actual_pct: 40,
          bucket_total: 1200,
          available_to_spend: 300,
          is_over_flag: false,
        },
      },
      future_you: {
        line_items: [],
        dashboard: {
          bucket: 'future_you',
          goal_pct: 20,
          ideal_amount: 600,
          actual_pct: 0,
          bucket_total: 0,
          available_to_spend: 600,
          is_over_flag: false,
        },
      },
      fun: {
        line_items: [],
        dashboard: {
          bucket: 'fun',
          goal_pct: 30,
          ideal_amount: 900,
          actual_pct: 0,
          bucket_total: 0,
          available_to_spend: 900,
          is_over_flag: false,
        },
      },
    },
    allocation_status: {
      state: 'left',
      amount: 1800,
    },
  };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BudgetService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(BudgetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Test 1
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Test 2 — getBudget() with no args: default scope=household, no month param,
  // and the nested typed shape maps correctly.
  it('should GET /api/budget with default scope=household and no month param on getBudget()', (done: DoneFn) => {
    service.getBudget().subscribe(budget => {
      expect(budget).toEqual(mockBudget);
      // Nested bucket dashboard maps through untouched.
      expect(budget.buckets.future_you.dashboard.goal_pct).toBe(20);
      expect(budget.buckets.future_you.dashboard.is_over_flag).toBeFalse();
      // allocation_status carries state + amount and NO message field.
      expect(budget.allocation_status.state).toBe('left');
      expect(budget.allocation_status.amount).toBe(1800);
      expect((budget.allocation_status as any).message).toBeUndefined();
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/budget`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('scope')).toBe('household');
      expect(req.request.params.has('month')).toBeFalse();
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockBudget);
    });
  });

  // Test 3 — getBudget(Date) serialises month to YYYY-MM-01.
  it('should serialise a Date month to YYYY-MM-01 query param on getBudget()', (done: DoneFn) => {
    // Local-constructed date (March 2026) — deterministic regardless of TZ.
    const march = new Date(2026, 2, 15);

    service.getBudget(march).subscribe(() => done());

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/budget`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('month')).toBe('2026-03-01');
      expect(req.request.params.get('scope')).toBe('household');
      req.flush(mockBudget);
    });
  });

  // Test 4 — getBudget(string, 'personal') normalises the month string and sends scope.
  it('should normalise a string month and send scope=personal on getBudget()', (done: DoneFn) => {
    service.getBudget('2026-05-20', 'personal').subscribe(() => done());

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/budget`);
      expect(req.request.params.get('month')).toBe('2026-05-01');
      expect(req.request.params.get('scope')).toBe('personal');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockBudget);
    });
  });

  // Test 5 — createIncome POSTs to the budget's income collection.
  it('should POST /api/budget/{id}/income with body on createIncome()', (done: DoneFn) => {
    const payload: IncomeStreamCreate = { label: 'Salary', amount: 3000 };

    service.createIncome('bud-1', payload).subscribe(income => {
      expect(income).toEqual(mockIncome);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/income`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockIncome);
    });
  });

  // Test 6 — updateIncome PATCHes a single income stream.
  it('should PATCH /api/budget/{id}/income/{incomeId} with body on updateIncome()', (done: DoneFn) => {
    const update: IncomeStreamUpdate = { amount: 3200 };

    service.updateIncome('bud-1', 'inc-1', update).subscribe(income => {
      expect(income).toEqual({ ...mockIncome, amount: 3200 });
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/income/inc-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(update);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush({ ...mockIncome, amount: 3200 });
    });
  });

  // Test 7 — deleteIncome DELETEs a single income stream (204, no body).
  it('should DELETE /api/budget/{id}/income/{incomeId} on deleteIncome()', (done: DoneFn) => {
    service.deleteIncome('bud-1', 'inc-1').subscribe(() => done());

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/income/inc-1`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // Test 8 — createLineItem POSTs to the budget's line-items collection.
  it('should POST /api/budget/{id}/line-items with body on createLineItem()', (done: DoneFn) => {
    const payload: LineItemCreate = { bucket: 'fundamentals', label: 'Rent', amount: 1200 };

    service.createLineItem('bud-1', payload).subscribe(item => {
      expect(item).toEqual(mockLineItem);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/line-items`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockLineItem);
    });
  });

  // Test 9 — updateLineItem PATCHes a single line item.
  it('should PATCH /api/budget/{id}/line-items/{itemId} with body on updateLineItem()', (done: DoneFn) => {
    const update: LineItemUpdate = { amount: 1300, bucket: 'fun' };

    service.updateLineItem('bud-1', 'li-1', update).subscribe(item => {
      expect(item).toEqual({ ...mockLineItem, amount: 1300, bucket: 'fun' });
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/line-items/li-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(update);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush({ ...mockLineItem, amount: 1300, bucket: 'fun' });
    });
  });

  // Test 10 — deleteLineItem DELETEs a single line item (204, no body).
  it('should DELETE /api/budget/{id}/line-items/{itemId} on deleteLineItem()', (done: DoneFn) => {
    service.deleteLineItem('bud-1', 'li-1').subscribe(() => done());

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1/line-items/li-1`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // Test 11 — updateGoals PATCHes the budget with the three goal percentages.
  it('should PATCH /api/budget/{id} with goal percentages on updateGoals()', (done: DoneFn) => {
    const goals: BudgetGoalsUpdate = {
      fundamentals_goal_pct: 50,
      future_you_goal_pct: 30,
      fun_goal_pct: 20,
    };

    service.updateGoals('bud-1', goals).subscribe(budget => {
      expect(budget).toEqual(mockBudget);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(goals);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockBudget);
    });
  });

  // Test 12 — updateCurrency PATCHes the same budget endpoint with a currency body.
  it('should PATCH /api/budget/{id} with a currency body on updateCurrency()', (done: DoneFn) => {
    service.updateCurrency('bud-1', 'USD').subscribe(budget => {
      expect(budget).toEqual(mockBudget);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(`${environment.apiUrl}/budget/bud-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ currency: 'USD' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockBudget);
    });
  });

  // Test 13 — token-null yields an Observable error (not a synchronous throw),
  // mirroring the old MoneyService contract.
  it('should return an Observable error (not throw synchronously) when token is null', (done: DoneFn) => {
    mockAuthService.getToken.and.returnValue(null);

    let threwSynchronously = false;
    let obs: any;
    try {
      obs = service.getBudget();
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
