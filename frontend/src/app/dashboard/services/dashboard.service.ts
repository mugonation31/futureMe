import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { environment } from '../../../environments/environment';

export interface DashboardStats {
  total_budget?: number;
  total_spent?: number;
  remaining_budget?: number;
  savings_rate?: number;
  total_clients?: number;
  total_invoices?: number;
  total_revenue?: number;
  outstanding_amount?: number;
  overdue_count?: number;
  paid_this_month?: number;
  draft_count?: number;
  recent_invoices?: {
    id: string;
    invoice_number: string;
    client_name: string;
    total_due: number;
    status: string;
    created_at: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
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

  getStats(): Observable<DashboardStats> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers =>
        this.http.get<DashboardStats>(`${this.apiUrl}/dashboard`, { headers })
      )
    );
  }
}
