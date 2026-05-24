import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, filter, take, switchMap } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private supabase: SupabaseClient;

    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser$: Observable<User | null>;

    // Tracks whether the initial session load is complete
    private sessionLoadedSubject = new BehaviorSubject<boolean>(false);
    public sessionLoaded$ = this.sessionLoadedSubject.asObservable();

    constructor() {
        this.supabase = createClient(
            environment.supabase.url,
            environment.supabase.anonKey
        );

        this.currentUserSubject = new BehaviorSubject<User | null>(null);
        this.currentUser$ = this.currentUserSubject.asObservable();

        this.loadSession();
    }

    private async loadSession() {
        const { data } = await this.supabase.auth.getSession();
        if (data.session?.user) {
            this.currentUserSubject.next(data.session.user);
        }

        // Mark session as loaded
        this.sessionLoadedSubject.next(true);

        this.supabase.auth.onAuthStateChange((event, session) => {
            this.currentUserSubject.next(session?.user ?? null);
        });
    }

    /**
     * Returns an observable that waits for session to load, then emits the current user
     */
    currentUserAfterLoad$(): Observable<User | null> {
        return this.sessionLoaded$.pipe(
            filter(loaded => loaded),
            take(1),
            switchMap(() => this.currentUser$.pipe(take(1)))
        );
    }

    async signUp(email: string, password: string, name: string) {
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name
                }
            }
        });
        if (error) throw error;
        return data;
    }

    async signIn(email: string, password: string) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    }

    async signOut() {
        const { error } = await this.supabase.auth.signOut();
        if (error) throw error;
    }

    async getSession(): Promise<Session | null> {
        const { data } = await this.supabase.auth.getSession();
        return data.session;
    }

    async getAccessToken(): Promise<string | null> {
        const session = await this.getSession();
        return session?.access_token ?? null;
    }

    getCurrentUser(): User | null {
        return this.currentUserSubject.value;
    }
}
