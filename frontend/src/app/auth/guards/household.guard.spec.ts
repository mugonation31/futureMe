import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { of, throwError } from 'rxjs';
import { householdGuard } from './household.guard';
import { HouseholdService } from '../../household/services/household.service';

describe('householdGuard', () => {
  let mockHouseholdService: { getMyHousehold: jasmine.Spy };
  let mockRouter: { navigate: jasmine.Spy };
  let mockRoute: ActivatedRouteSnapshot;
  let mockState: RouterStateSnapshot;

  beforeEach(() => {
    mockHouseholdService = {
      getMyHousehold: jasmine.createSpy('getMyHousehold')
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate')
    };

    mockRoute = {} as ActivatedRouteSnapshot;
    mockState = { url: '/dashboard' } as RouterStateSnapshot;

    TestBed.configureTestingModule({
      providers: [
        { provide: HouseholdService, useValue: mockHouseholdService },
        { provide: Router, useValue: mockRouter }
      ]
    });
  });

  // Test 1: should redirect to /onboarding when user has no household
  it('should redirect to /onboarding when user has no household', (done) => {
    // Arrange: getMyHousehold returns an error (404 - no household)
    mockHouseholdService.getMyHousehold.and.returnValue(throwError(() => ({ status: 404 })));

    // Act: run the guard
    TestBed.runInInjectionContext(() => {
      const result = householdGuard(mockRoute, mockState);
      if (result instanceof Object && 'subscribe' in result) {
        (result as any).subscribe((allowed: boolean) => {
          // Assert
          expect(allowed).toBeFalse();
          expect(mockRouter.navigate).toHaveBeenCalledWith(['/onboarding']);
          done();
        });
      }
    });
  });

  // Test 2: should allow access when user has a household
  it('should allow access when user has a household', (done) => {
    // Arrange: getMyHousehold returns a household
    mockHouseholdService.getMyHousehold.and.returnValue(
      of({ id: 'household-123', name: 'The Smiths', invite_code: 'ABC123', created_at: '', created_by: 'user-123' })
    );

    // Act: run the guard
    TestBed.runInInjectionContext(() => {
      const result = householdGuard(mockRoute, mockState);
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

  // Test 3: should not redirect when user already on /onboarding
  it('should not redirect when user already on /onboarding', (done) => {
    // Arrange: no household AND already on setup page
    mockHouseholdService.getMyHousehold.and.returnValue(throwError(() => ({ status: 404 })));
    mockState = { url: '/onboarding' } as RouterStateSnapshot;

    // Act: run the guard
    TestBed.runInInjectionContext(() => {
      const result = householdGuard(mockRoute, mockState);
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
});
