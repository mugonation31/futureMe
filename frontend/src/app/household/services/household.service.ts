import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

export interface HouseholdPublic {
  id: string;
  name: string;
  created_at: string;
}

export interface Household extends HouseholdPublic {
  invite_code: string;
  created_by: string;
}

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  currentHousehold$ = new BehaviorSubject<HouseholdPublic | null>(null);

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) throw new Error('Not authenticated');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    });
  }

  createHousehold(name: string): Observable<Household> {
    return this.http.post<Household>(
      `${this.apiUrl}/households`,
      { name },
      { headers: this.getHeaders() }
    ).pipe(tap(h => this.currentHousehold$.next(h)));
  }

  getMyHousehold(): Observable<HouseholdPublic> {
    return this.http.get<HouseholdPublic>(
      `${this.apiUrl}/households/me`,
      { headers: this.getHeaders() }
    ).pipe(tap(h => this.currentHousehold$.next(h)));
  }

  getInviteCode(): Observable<Household> {
    return this.http.get<Household>(
      `${this.apiUrl}/households/invite-code`,
      { headers: this.getHeaders() }
    );
  }

  joinHousehold(invite_code: string): Observable<HouseholdPublic> {
    return this.http.post<HouseholdPublic>(
      `${this.apiUrl}/households/join`,
      { invite_code },
      { headers: this.getHeaders() }
    ).pipe(tap(h => this.currentHousehold$.next(h)));
  }
}
