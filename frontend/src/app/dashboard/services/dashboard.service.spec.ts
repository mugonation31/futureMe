import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { environment } from '../../../environments/environment';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  let mockSupabaseService: { getAccessToken: jasmine.Spy };

  beforeEach(() => {
    mockSupabaseService = {
      getAccessToken: jasmine.createSpy('getAccessToken').and.returnValue(Promise.resolve('fake-token'))
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DashboardService,
        { provide: SupabaseService, useValue: mockSupabaseService }
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

  // Test 3: apiUrl must equal environment.apiUrl exactly (no http:// fallback)
  it('should use environment.apiUrl directly without a fallback', () => {
    // Arrange & Act: access the private field via bracket notation
    const apiUrl = (service as any)['apiUrl'];

    // Assert: must equal exactly what environment provides, not a hardcoded fallback
    expect(apiUrl).toBe(environment.apiUrl);
    expect(apiUrl).not.toContain('localhost:8000');
  });

  // Test 4: should be created
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Test 5: should call GET /api/dashboard with auth headers on getStats()
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
});
