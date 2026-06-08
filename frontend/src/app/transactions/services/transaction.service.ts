import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { Category, Transaction, TransactionCreate } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) throw new Error('Not authenticated');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    });
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`, {
      headers: this.getHeaders(),
    });
  }

  getTransactions(month?: string): Observable<Transaction[]> {
    let params = new HttpParams();
    if (month) {
      params = params.set('month', month);
    }
    return this.http.get<Transaction[]>(`${this.apiUrl}/transactions`, {
      headers: this.getHeaders(),
      params,
    });
  }

  createTransaction(data: TransactionCreate): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.apiUrl}/transactions`, data, {
      headers: this.getHeaders(),
    });
  }

  updateTransaction(id: string, data: Partial<TransactionCreate>): Observable<Transaction> {
    return this.http.patch<Transaction>(`${this.apiUrl}/transactions/${id}`, data, {
      headers: this.getHeaders(),
    });
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/transactions/${id}`, {
      headers: this.getHeaders(),
    });
  }
}
