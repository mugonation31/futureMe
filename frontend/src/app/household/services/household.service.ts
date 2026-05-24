import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, from, switchMap, tap } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
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

@Injectable({
  providedIn: 'root'
})
export class HouseholdService {
  private http = inject(HttpClient);
  private supabaseService = inject(SupabaseService);

  private apiUrl = environment.apiUrl;
  currentHousehold$ = new BehaviorSubject<HouseholdPublic | null>(null);

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.supabaseService.getAccessToken();
    if (!token) throw new Error('No active session');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  createHousehold(name: string): Observable<Household> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.post<Household>(`${this.apiUrl}/households`, { name }, { headers })
      ),
      tap(h => this.currentHousehold$.next(h))
    );
  }

  getMyHousehold(): Observable<HouseholdPublic> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.get<HouseholdPublic>(`${this.apiUrl}/households/me`, { headers })
      ),
      tap(h => this.currentHousehold$.next(h))
    );
  }

  getInviteCode(): Observable<Household> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.get<Household>(`${this.apiUrl}/households/invite-code`, { headers })
      )
    );
  }

  joinHousehold(invite_code: string): Observable<HouseholdPublic> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.post<HouseholdPublic>(`${this.apiUrl}/households/join`, { invite_code }, { headers })
      ),
      tap(h => this.currentHousehold$.next(h))
    );
  }
}
