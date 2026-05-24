import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SettingsService } from './settings.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CompanySettings } from '../models/settings.model';
import { environment } from '../../../environments/environment';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;
  let mockSupabaseService: { getAccessToken: jasmine.Spy };

  const mockSettings: CompanySettings = {
    id: 'settings-123',
    company_name: 'My Company Ltd',
    company_email: 'info@mycompany.com',
    company_phone: '020-1234-5678',
    bank_account_name: 'My Company Ltd',
    bank_name: 'Barclays',
    account_number: '12345678',
    sort_code: '20-30-40',
    iban: 'GB29NWBK60161331926819',
    user_id: 'user-123',
    created_at: '2026-01-15T10:00:00',
    updated_at: '2026-01-15T10:00:00',
  };

  beforeEach(() => {
    mockSupabaseService = {
      getAccessToken: jasmine.createSpy('getAccessToken').and.returnValue(Promise.resolve('fake-token'))
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SettingsService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });

    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Test 5: apiUrl must equal environment.apiUrl exactly (no http:// fallback)
  it('should use environment.apiUrl directly without a fallback', () => {
    // Arrange & Act: access the private field via bracket notation
    const apiUrl = (service as any)['apiUrl'];

    // Assert: must equal exactly what environment provides, not a hardcoded fallback
    expect(apiUrl).toBe(environment.apiUrl);
    expect(apiUrl).not.toContain('localhost:8000');
  });

  // Test 6: should be created
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Test 7: should call GET /api/settings with auth headers
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

  // Test 8: should call PUT /api/settings with settings data
  it('should call PUT /api/settings with settings data on updateSettings()', (done: DoneFn) => {
    const updateData: Partial<CompanySettings> = {
      company_name: 'Updated Company',
      bank_name: 'HSBC',
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
