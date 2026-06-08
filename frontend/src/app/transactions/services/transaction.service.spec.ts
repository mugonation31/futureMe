import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TransactionService } from './transaction.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

describe('TransactionService', () => {
  let service: TransactionService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  const MOCK_TOKEN = 'fake-jwt-token';
  const API_BASE = environment.apiUrl;

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue(MOCK_TOKEN),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TransactionService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(TransactionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Test 1 — injectable
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Test 2 — getCategories calls GET /api/categories with auth header
  it('should call GET /api/categories with auth header on getCategories()', () => {
    // Arrange
    const mockCategories = [
      { id: 'cat-1', household_id: null, name: 'Groceries', icon: null, color: null, is_default: true },
    ];

    // Act
    service.getCategories().subscribe(cats => {
      // Assert on response
      expect(cats.length).toBe(1);
      expect(cats[0].name).toBe('Groceries');
    });

    // Assert on request
    const req = httpMock.expectOne(`${API_BASE}/categories`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`);
    req.flush(mockCategories);
  });

  // Test 3 — getTransactions calls GET /api/transactions with auth header
  it('should call GET /api/transactions with auth header on getTransactions()', () => {
    // Arrange
    const mockTransactions = [
      {
        id: 'txn-1', household_id: 'hh-1', user_id: 'u-1',
        category_id: 'cat-1', category_name: 'Groceries',
        amount: 50.00, type: 'expense', description: 'Weekly shop',
        date: '2026-06-01', created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-01T10:00:00Z',
      },
    ];

    // Act
    service.getTransactions().subscribe();

    // Assert
    const req = httpMock.expectOne(`${API_BASE}/transactions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`);
    req.flush(mockTransactions);
  });

  // Test 4 — getTransactions with month adds ?month= query param
  it('should call GET /api/transactions?month=2026-06 when month param is provided', () => {
    // Act
    service.getTransactions('2026-06').subscribe();

    // Assert
    const req = httpMock.expectOne(`${API_BASE}/transactions?month=2026-06`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  // Test 5 — createTransaction calls POST /api/transactions with body
  it('should call POST /api/transactions with body on createTransaction()', () => {
    // Arrange
    const payload = { amount: 55.00, type: 'expense' as const, description: 'Weekly shop', date: '2026-06-01', category_id: null };
    const mockResponse = { id: 'txn-1', ...payload, household_id: 'hh-1', user_id: 'u-1', category_name: 'Groceries', created_at: '', updated_at: '' };

    // Act
    service.createTransaction(payload).subscribe();

    // Assert
    const req = httpMock.expectOne(`${API_BASE}/transactions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.amount).toBe(55.00);
    expect(req.request.body.type).toBe('expense');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${MOCK_TOKEN}`);
    req.flush(mockResponse);
  });

  // Test 6 — updateTransaction calls PATCH /api/transactions/{id}
  it('should call PATCH /api/transactions/{id} on updateTransaction()', () => {
    // Arrange
    const id = 'txn-1';
    const patch = { amount: 60.00 };
    const mockResponse = { id, amount: 60.00, type: 'expense', household_id: 'hh-1', user_id: 'u-1', category_id: null, category_name: null, description: null, date: '2026-06-01', created_at: '', updated_at: '' };

    // Act
    service.updateTransaction(id, patch).subscribe();

    // Assert
    const req = httpMock.expectOne(`${API_BASE}/transactions/${id}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.amount).toBe(60.00);
    req.flush(mockResponse);
  });

  // Test 7 — deleteTransaction calls DELETE /api/transactions/{id}
  it('should call DELETE /api/transactions/{id} on deleteTransaction()', () => {
    // Arrange
    const id = 'txn-1';

    // Act
    service.deleteTransaction(id).subscribe();

    // Assert
    const req = httpMock.expectOne(`${API_BASE}/transactions/${id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
