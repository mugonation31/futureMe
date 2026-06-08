/**
 * SupabaseService stub — the app has migrated to AuthService.
 * This file is retained only so existing guard specs that reference
 * SupabaseService continue to compile while they are updated.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  currentUserAfterLoad$(): Observable<any> {
    return this.currentUser$;
  }

  async signUp(_email: string, _password: string, _name: string): Promise<any> {
    throw new Error('SupabaseService is a stub. Use AuthService instead.');
  }

  async signIn(_email: string, _password: string): Promise<any> {
    throw new Error('SupabaseService is a stub. Use AuthService instead.');
  }

  async signOut(): Promise<void> {
    throw new Error('SupabaseService is a stub. Use AuthService instead.');
  }

  async getSession(): Promise<any> {
    return null;
  }

  async getAccessToken(): Promise<string | null> {
    return null;
  }
}
