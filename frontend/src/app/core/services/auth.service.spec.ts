import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService, AuthResponse } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const MOCK_AUTH_RESPONSE: AuthResponse & { refresh_token: string } = {
    access_token: 'mock.access.token',
    refresh_token: 'mock.refresh.token',
    user: { id: 'user-1', email: 'test@test.com', display_name: null },
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ============================================================
  // Test 10: handleAuth stores refresh_token under fm_refresh_token
  // ============================================================

  it('should store refresh_token in localStorage under fm_refresh_token when handleAuth is called', (done: DoneFn) => {
    // Arrange - login will call handleAuth internally
    service.login('test@test.com', 'password').subscribe(() => {
      // Assert
      const storedRefresh = localStorage.getItem('fm_refresh_token');
      expect(storedRefresh).toBe('mock.refresh.token');
      done();
    });

    // Act
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush(MOCK_AUTH_RESPONSE);
  });

  // ============================================================
  // Test 11: logout removes fm_refresh_token from localStorage
  // ============================================================

  it('should remove fm_refresh_token from localStorage when logout is called', () => {
    // Arrange
    localStorage.setItem('fm_refresh_token', 'some.refresh.token');
    localStorage.setItem('fm_access_token', 'some.access.token');

    // Act
    service.logout();

    // Assert
    expect(localStorage.getItem('fm_refresh_token')).toBeNull();
    expect(localStorage.getItem('fm_access_token')).toBeNull();
  });

  // ============================================================
  // Test 12: refreshAccessToken() calls POST /api/auth/refresh
  // ============================================================

  it('should call POST /api/auth/refresh with stored refresh token in refreshAccessToken()', (done: DoneFn) => {
    // Arrange
    const storedRefreshToken = 'stored.refresh.token';
    localStorage.setItem('fm_refresh_token', storedRefreshToken);

    // Act
    service.refreshAccessToken().subscribe(res => {
      // Assert — response should contain new access token
      expect(res.access_token).toBe('new.access.token');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refresh_token: storedRefreshToken });
    req.flush({ access_token: 'new.access.token' });
  });
});
