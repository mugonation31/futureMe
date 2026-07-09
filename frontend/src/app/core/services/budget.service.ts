import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import {
  BudgetResponse,
  BudgetScope,
  IncomeStream,
  IncomeStreamCreate,
  IncomeStreamUpdate,
  LineItem,
  LineItemCreate,
  LineItemUpdate,
  BudgetGoalsUpdate,
  BudgetCurrencyUpdate,
  CurrencyCode,
} from '../models/budget.models';

@Injectable({ providedIn: 'root' })
export class BudgetService {
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

  /**
   * Normalise any date-in-month to the first-of-month `YYYY-MM-01` string the
   * backend's `month` query param expects. Accepts a `Date` (uses its local
   * year/month) or a `YYYY-MM[-DD]` string (takes the `YYYY-MM` portion).
   */
  private toMonthParam(month: Date | string): string {
    if (month instanceof Date) {
      const year = month.getFullYear();
      const paddedMonth = String(month.getMonth() + 1).padStart(2, '0');
      return `${year}-${paddedMonth}-01`;
    }
    return `${month.slice(0, 7)}-01`;
  }

  getBudget(month?: Date | string, scope: BudgetScope = 'household'): Observable<BudgetResponse> {
    return this.callWithHeaders(headers => {
      let params = new HttpParams().set('scope', scope);
      if (month) {
        params = params.set('month', this.toMonthParam(month));
      }
      return this.http.get<BudgetResponse>(`${this.apiUrl}/budget`, { headers, params });
    });
  }

  createIncome(budgetId: string, data: IncomeStreamCreate): Observable<IncomeStream> {
    return this.callWithHeaders(headers =>
      this.http.post<IncomeStream>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/income`, data, { headers })
    );
  }

  updateIncome(budgetId: string, incomeId: string, data: IncomeStreamUpdate): Observable<IncomeStream> {
    return this.callWithHeaders(headers =>
      this.http.patch<IncomeStream>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/income/${encodeURIComponent(incomeId)}`, data, { headers })
    );
  }

  deleteIncome(budgetId: string, incomeId: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/income/${encodeURIComponent(incomeId)}`, { headers })
    );
  }

  createLineItem(budgetId: string, data: LineItemCreate): Observable<LineItem> {
    return this.callWithHeaders(headers =>
      this.http.post<LineItem>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/line-items`, data, { headers })
    );
  }

  updateLineItem(budgetId: string, itemId: string, data: LineItemUpdate): Observable<LineItem> {
    return this.callWithHeaders(headers =>
      this.http.patch<LineItem>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/line-items/${encodeURIComponent(itemId)}`, data, { headers })
    );
  }

  deleteLineItem(budgetId: string, itemId: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}/line-items/${encodeURIComponent(itemId)}`, { headers })
    );
  }

  updateGoals(budgetId: string, goals: BudgetGoalsUpdate): Observable<BudgetResponse> {
    return this.callWithHeaders(headers =>
      this.http.patch<BudgetResponse>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}`, goals, { headers })
    );
  }

  updateCurrency(budgetId: string, currency: CurrencyCode): Observable<BudgetResponse> {
    const body: BudgetCurrencyUpdate = { currency };
    return this.callWithHeaders(headers =>
      this.http.patch<BudgetResponse>(`${this.apiUrl}/budget/${encodeURIComponent(budgetId)}`, body, { headers })
    );
  }
}
