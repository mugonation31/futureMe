import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { DashboardStats } from '../../core/models/money.models';

export { DashboardStats };

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) {
      throw new Error('No auth token available');
    }
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    });
  }

  private callWithHeaders<T>(httpCall: (headers: HttpHeaders) => Observable<T>): Observable<T> {
    try {
      const headers = this.getHeaders();
      return httpCall(headers);
    } catch (err) {
      return throwError(() => err);
    }
  }

  getStats(): Observable<DashboardStats> {
    return this.callWithHeaders(headers =>
      this.http.get<DashboardStats>(`${this.apiUrl}/dashboard`, { headers })
    );
  }
}
