import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UserSettings } from '../models/settings.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  private settings$: Observable<UserSettings> | null = null;

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    });
  }

  getSettings(): Observable<UserSettings> {
    if (!this.settings$) {
      this.settings$ = this.http
        .get<UserSettings>(`${this.apiUrl}/settings`, { headers: this.getHeaders() })
        .pipe(shareReplay(1));
    }
    return this.settings$;
  }

  updateSettings(settings: Partial<UserSettings>): Observable<UserSettings> {
    this.settings$ = null; // invalidate cache so next getSettings() re-fetches
    return this.http.put<UserSettings>(`${this.apiUrl}/settings`, settings, { headers: this.getHeaders() });
  }
}
