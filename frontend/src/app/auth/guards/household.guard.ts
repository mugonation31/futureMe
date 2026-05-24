import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HouseholdService } from '../../household/services/household.service';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const householdGuard: CanActivateFn = (_route, state) => {
  const householdService = inject(HouseholdService);
  const router = inject(Router);

  if (state.url === '/onboarding') {
    return of(true);
  }

  return householdService.getMyHousehold().pipe(
    map(() => true),
    catchError(() => {
      router.navigate(['/onboarding']);
      return of(false);
    })
  );
};
