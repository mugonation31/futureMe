import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let mockAuthService: {
    getToken: jasmine.Spy;
    refreshAccessToken: jasmine.Spy;
    logout: jasmine.Spy;
  };
  let mockRouter: { navigate: jasmine.Spy };

  beforeEach(() => {
    mockAuthService = {
      getToken: jasmine.createSpy('getToken').and.returnValue('old.access.token'),
      refreshAccessToken: jasmine.createSpy('refreshAccessToken').and.returnValue(
        of({ access_token: 'new.access.token' })
      ),
      logout: jasmine.createSpy('logout'),
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate'),
    };

    localStorage.clear();
    localStorage.setItem('fm_access_token', 'old.access.token');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ============================================================
  // Test 13: intercepts 401, refreshes token, retries request
  // ============================================================

  it('should intercept 401, call refreshAccessToken, store new token, and retry original request', (done: DoneFn) => {
    // Arrange
    mockAuthService.refreshAccessToken.and.returnValue(
      of({ access_token: 'new.access.token' })
    );

    // Act
    http.get('/api/some-protected-resource').subscribe({
      next: (res) => {
        // Assert — the retry succeeded
        expect(res).toEqual({ data: 'ok' });
        expect(mockAuthService.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('fm_access_token')).toBe('new.access.token');
        done();
      },
      error: done.fail,
    });

    // First request returns 401
    const firstReq = httpMock.expectOne('/api/some-protected-resource');
    firstReq.flush({ detail: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // Retry request (after refresh) returns 200
    const retryReq = httpMock.expectOne('/api/some-protected-resource');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new.access.token');
    retryReq.flush({ data: 'ok' });
  });

  // ============================================================
  // Test 14: intercepts 401, refresh fails → logout and navigate to /login
  // ============================================================

  it('should call logout and navigate to /login when refreshAccessToken fails on 401', (done: DoneFn) => {
    // Arrange
    mockAuthService.refreshAccessToken.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }))
    );

    // Act
    http.get('/api/some-protected-resource').subscribe({
      next: () => done.fail('Expected error'),
      error: () => {
        // Assert
        expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
        done();
      },
    });

    // First request returns 401
    const req = httpMock.expectOne('/api/some-protected-resource');
    req.flush({ detail: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });
});
