import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { UserSettings } from '../models/settings.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private http = inject(HttpClient);
  private supabaseService = inject(SupabaseService);

  private apiUrl = environment.apiUrl;

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.supabaseService.getAccessToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  getSettings(): Observable<UserSettings> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.get<UserSettings>(`${this.apiUrl}/settings`, { headers })
      )
    );
  }

  updateSettings(settings: Partial<UserSettings>): Observable<UserSettings> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.put<UserSettings>(`${this.apiUrl}/settings`, settings, { headers })
      )
    );
  }
}
