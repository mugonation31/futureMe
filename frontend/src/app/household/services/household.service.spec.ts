import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HouseholdService } from './household.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

describe('HouseholdService', () => {
  let service: HouseholdService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  const mockHousehold = {
    id: 'household-123',
    name: 'The Smiths',
    invite_code: 'ABC123',
    created_at: '2026-01-15T10:00:00',
    created_by: 'user-123'
  };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token')
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        HouseholdService,
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    service = TestBed.inject(HouseholdService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should use environment.apiUrl directly without a fallback', () => {
    const apiUrl = (service as any)['apiUrl'];

    expect(apiUrl).toBe(environment.apiUrl);
    expect(apiUrl).not.toContain('localhost:8000');
    expect(apiUrl).not.toContain('localhost:8001');
  });

  it('should call POST /api/households with name on createHousehold()', (done: DoneFn) => {
    service.createHousehold('The Smiths').subscribe(household => {
      expect(household).toEqual(mockHousehold);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/households') && !r.url.includes('/join') && !r.url.includes('/me'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'The Smiths' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockHousehold);
    });
  });

  it('should call GET /api/households/me with auth headers on getMyHousehold()', (done: DoneFn) => {
    service.getMyHousehold().subscribe(household => {
      expect(household).toEqual(mockHousehold);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/households/me'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockHousehold);
    });
  });

  it('should call POST /api/households/join with invite code on joinHousehold()', (done: DoneFn) => {
    service.joinHousehold('ABC123').subscribe(household => {
      expect(household).toEqual(mockHousehold);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/households/join'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ invite_code: 'ABC123' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockHousehold);
    });
  });
});
