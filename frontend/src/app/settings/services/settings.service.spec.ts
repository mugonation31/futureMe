import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SettingsService } from './settings.service';
import { AuthService } from '../../core/services/auth.service';
import { UserSettings } from '../models/settings.model';
import { environment } from '../../../environments/environment';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;
  let mockAuthService: { getToken: jasmine.Spy };

  const mockSettings: UserSettings = {
    user_id: 'user-123',
    display_name: 'Alice',
    currency: 'GBP',
    monthly_budget: 2000,
    created_at: '2026-01-15T10:00:00',
    updated_at: '2026-01-15T10:00:00',
  };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token')
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SettingsService,
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should use environment.apiUrl directly without a fallback', () => {
    const apiUrl = (service as any)['apiUrl'];

    expect(apiUrl).toBe(environment.apiUrl);
    expect(apiUrl).not.toContain('localhost:8000');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call GET /api/settings with auth headers on getSettings()', (done: DoneFn) => {
    service.getSettings().subscribe(settings => {
      expect(settings).toEqual(mockSettings);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/settings'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockSettings);
    });
  });

  it('should call PUT /api/settings with settings data on updateSettings()', (done: DoneFn) => {
    const updateData: Partial<UserSettings> = {
      display_name: 'Bob',
      currency: 'USD',
    };

    service.updateSettings(updateData).subscribe(settings => {
      expect(settings).toEqual(mockSettings);
      done();
    });

    setTimeout(() => {
      const req = httpMock.expectOne(r => r.url.includes('/api/settings'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateData);
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      req.flush(mockSettings);
    });
  });
});
