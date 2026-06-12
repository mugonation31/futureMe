import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
// throwError import removed — not needed after callWithHeaders fix

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token')
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DashboardService,
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const mockStats = {
    total_clients: 5,
    total_invoices: 12,
    total_revenue: 15000,
    outstanding_amount: 3500,
    overdue_count: 2,
    paid_this_month: 5000,
    draft_count: 3,
    recent_invoices: [
      {
        id: 'inv-1',
        invoice_number: 'INV-0001',
        client_name: 'Acme Corp',
        total_due: 1200,
        status: 'paid',
        created_at: '2026-03-01T10:00:00',
      }
    ]
  };

  it('should use environment.apiUrl directly without a fallback', () => {
    const apiUrl = (service as any)['apiUrl'];

    expect(apiUrl).toBe(environment.apiUrl);
    expect(apiUrl).not.toContain('localhost:8000');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call GET /api/dashboard with auth headers on getStats()', (done: DoneFn) => {
    service.getStats().subscribe(stats => {
      expect(stats).toEqual(mockStats as any);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/dashboard'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockStats);
    });
  });

  it('should throw "No auth token available" when getToken() returns null (getHeaders direct call)', () => {
    // Arrange
    mockAuthService.getToken.and.returnValue(null);

    // Act & Assert
    expect(() => (service as any)['getHeaders']()).toThrowError('No auth token available');
  });

  it('should return an Observable error (not throw synchronously) from getStats() when token is null', (done: DoneFn) => {
    // Arrange
    mockAuthService.getToken.and.returnValue(null);

    // Act — should NOT throw, should return an observable that errors
    let threwSynchronously = false;
    let obs: any;
    try {
      obs = service.getStats();
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
