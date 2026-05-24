import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { map } from 'rxjs/operators';

export const authGuard: CanActivateFn = (_route, state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  // Wait for session to load, then check if user is authenticated
  return supabaseService.currentUserAfterLoad$().pipe(
    map(user => {
      if (user) {
        return true;
      } else {
        router.navigate(['/login'], {
          queryParams: { returnUrl: state.url }
        });
        return false;
      }
    })
  );
};
