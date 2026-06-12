import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import {
  Account,
  AccountCreate,
  IncomeEntry,
  IncomeCreate,
  Expense,
  ExpenseCreate,
  Debt,
  DebtCreate,
  SavingsGoal,
  SavingsGoalCreate,
} from '../models/money.models';

@Injectable({ providedIn: 'root' })
export class MoneyService {
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

  // Accounts
  getAccounts(): Observable<Account[]> {
    return this.callWithHeaders(headers =>
      this.http.get<Account[]>(`${this.apiUrl}/accounts`, { headers })
    );
  }

  createAccount(data: AccountCreate): Observable<Account> {
    return this.callWithHeaders(headers =>
      this.http.post<Account>(`${this.apiUrl}/accounts`, data, { headers })
    );
  }

  updateAccount(id: string, data: Partial<AccountCreate>): Observable<Account> {
    return this.callWithHeaders(headers =>
      this.http.patch<Account>(`${this.apiUrl}/accounts/${id}`, data, { headers })
    );
  }

  deleteAccount(id: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/accounts/${id}`, { headers })
    );
  }

  // Income
  getIncome(): Observable<IncomeEntry[]> {
    return this.callWithHeaders(headers =>
      this.http.get<IncomeEntry[]>(`${this.apiUrl}/income`, { headers })
    );
  }

  createIncome(data: IncomeCreate): Observable<IncomeEntry> {
    return this.callWithHeaders(headers =>
      this.http.post<IncomeEntry>(`${this.apiUrl}/income`, data, { headers })
    );
  }

  updateIncome(id: string, data: Partial<IncomeCreate>): Observable<IncomeEntry> {
    return this.callWithHeaders(headers =>
      this.http.patch<IncomeEntry>(`${this.apiUrl}/income/${id}`, data, { headers })
    );
  }

  deleteIncome(id: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/income/${id}`, { headers })
    );
  }

  // Expenses
  getExpenses(): Observable<Expense[]> {
    return this.callWithHeaders(headers =>
      this.http.get<Expense[]>(`${this.apiUrl}/expenses`, { headers })
    );
  }

  createExpense(data: ExpenseCreate): Observable<Expense> {
    return this.callWithHeaders(headers =>
      this.http.post<Expense>(`${this.apiUrl}/expenses`, data, { headers })
    );
  }

  updateExpense(id: string, data: Partial<ExpenseCreate>): Observable<Expense> {
    return this.callWithHeaders(headers =>
      this.http.patch<Expense>(`${this.apiUrl}/expenses/${id}`, data, { headers })
    );
  }

  deleteExpense(id: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/expenses/${id}`, { headers })
    );
  }

  // Debts
  getDebts(): Observable<Debt[]> {
    return this.callWithHeaders(headers =>
      this.http.get<Debt[]>(`${this.apiUrl}/debts`, { headers })
    );
  }

  createDebt(data: DebtCreate): Observable<Debt> {
    return this.callWithHeaders(headers =>
      this.http.post<Debt>(`${this.apiUrl}/debts`, data, { headers })
    );
  }

  updateDebt(id: string, data: Partial<DebtCreate>): Observable<Debt> {
    return this.callWithHeaders(headers =>
      this.http.patch<Debt>(`${this.apiUrl}/debts/${id}`, data, { headers })
    );
  }

  deleteDebt(id: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/debts/${id}`, { headers })
    );
  }

  // Savings Goals
  getSavingsGoals(): Observable<SavingsGoal[]> {
    return this.callWithHeaders(headers =>
      this.http.get<SavingsGoal[]>(`${this.apiUrl}/savings-goals`, { headers })
    );
  }

  createSavingsGoal(data: SavingsGoalCreate): Observable<SavingsGoal> {
    return this.callWithHeaders(headers =>
      this.http.post<SavingsGoal>(`${this.apiUrl}/savings-goals`, data, { headers })
    );
  }

  updateSavingsGoal(id: string, data: Partial<SavingsGoalCreate>): Observable<SavingsGoal> {
    return this.callWithHeaders(headers =>
      this.http.patch<SavingsGoal>(`${this.apiUrl}/savings-goals/${id}`, data, { headers })
    );
  }

  deleteSavingsGoal(id: string): Observable<void> {
    return this.callWithHeaders(headers =>
      this.http.delete<void>(`${this.apiUrl}/savings-goals/${id}`, { headers })
    );
  }
}
