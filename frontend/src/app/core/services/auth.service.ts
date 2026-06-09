import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'fm_access_token';
  private readonly REFRESH_TOKEN_KEY = 'fm_refresh_token';
  private readonly apiUrl = environment.apiUrl;

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(this.loadUserFromToken());
  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  private loadUserFromToken(): AuthUser | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        return null;
      }
      return { id: payload.sub, email: payload.email, display_name: payload.display_name ?? null };
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  register(email: string, password: string, name: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, { email, password, name }).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    this.currentUserSubject.next(null);
  }

  storeAccessToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.currentUserSubject.next({ id: payload.sub, email: payload.email, display_name: payload.display_name ?? null });
    } catch {
      // token parse failure — leave currentUser as-is
    }
  }

  refreshAccessToken(): Observable<{ access_token: string }> {
    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }
    return this.http.post<{ access_token: string }>(`${this.apiUrl}/auth/refresh`, {
      refresh_token: refreshToken,
    });
  }

  private handleAuth(res: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, res.access_token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, res.refresh_token);
    this.currentUserSubject.next(res.user);
  }
}
