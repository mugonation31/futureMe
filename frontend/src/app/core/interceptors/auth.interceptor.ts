import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Don't attempt refresh if the failing request is the refresh endpoint itself
        if (req.url.includes('/auth/refresh')) {
          authService.logout();
          router.navigate(['/login']);
          return throwError(() => error);
        }
        return authService.refreshAccessToken().pipe(
          switchMap((res) => {
            authService.storeAccessToken(res.access_token);
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${res.access_token}` },
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            authService.logout();
            router.navigate(['/login']);
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
