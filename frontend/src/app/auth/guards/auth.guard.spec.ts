import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { authGuard } from './auth.guard';
import { SupabaseService } from '../../core/services/supabase.service';

describe('authGuard', () => {
  let mockSupabaseService: { currentUser$: BehaviorSubject<any> };
  let mockRouter: { navigate: jasmine.Spy };
  let mockRoute: ActivatedRouteSnapshot;
  let mockState: RouterStateSnapshot;

  beforeEach(() => {
    mockSupabaseService = {
      currentUser$: new BehaviorSubject<any>(null)
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate')
    };

    mockRoute = {} as ActivatedRouteSnapshot;
    mockState = { url: '/dashboard' } as RouterStateSnapshot;

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: Router, useValue: mockRouter }
      ]
    });
  });

  it('should allow access when user is authenticated', (done) => {
    // Arrange: user is logged in
    mockSupabaseService.currentUser$.next({ id: '123', email: 'test@test.com' });

    // Act: run the guard
    TestBed.runInInjectionContext(() => {
      const result = authGuard(mockRoute, mockState);
      // The guard returns an Observable, so subscribe to get the value
      if (result instanceof Object && 'subscribe' in result) {
        (result as any).subscribe((allowed: boolean) => {
          // Assert
          expect(allowed).toBeTrue();
          expect(mockRouter.navigate).not.toHaveBeenCalled();
          done();
        });
      }
    });
  });

  it('should redirect to /login with returnUrl when user is not authenticated', (done) => {
    // Arrange: user is NOT logged in
    mockSupabaseService.currentUser$.next(null);

    // Act: run the guard
    TestBed.runInInjectionContext(() => {
      const result = authGuard(mockRoute, mockState);
      if (result instanceof Object && 'subscribe' in result) {
        (result as any).subscribe((allowed: boolean) => {
          // Assert
          expect(allowed).toBeFalse();
          expect(mockRouter.navigate).toHaveBeenCalledWith(['/login'], {
            queryParams: { returnUrl: '/dashboard' }
          });
          done();
        });
      }
    });
  });
});
