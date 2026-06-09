import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HouseholdService } from '../../household/services/household.service';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const householdGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const householdService = inject(HouseholdService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (householdService.currentHousehold$.value !== null) {
    return true;
  }

  return householdService.getMyHousehold().pipe(
    map(() => true),
    catchError(() => {
      router.navigate(['/onboarding']);
      return of(false);
    })
  );
};
