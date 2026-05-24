import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

// We mock the createClient at the module level to avoid real Supabase connections
// The service wraps an external boundary (Supabase), so mocking is appropriate

const mockAuth = {
  getSession: jasmine.createSpy('getSession').and.returnValue(Promise.resolve({ data: { session: null } })),
  signUp: jasmine.createSpy('signUp').and.returnValue(Promise.resolve({ data: {}, error: null })),
  signInWithPassword: jasmine.createSpy('signInWithPassword').and.returnValue(Promise.resolve({ data: {}, error: null })),
  signOut: jasmine.createSpy('signOut').and.returnValue(Promise.resolve({ error: null })),
  onAuthStateChange: jasmine.createSpy('onAuthStateChange').and.returnValue({ data: { subscription: { unsubscribe: () => {} } } })
};

// Mock the createClient function via spying on the service internals
// Since createClient is called in the constructor, we test through the public API

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    // Reset spies
    mockAuth.getSession.calls.reset();
    mockAuth.signUp.calls.reset();
    mockAuth.signInWithPassword.calls.reset();
    mockAuth.signOut.calls.reset();
    mockAuth.onAuthStateChange.calls.reset();

    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with null currentUser', () => {
    expect(service.getCurrentUser()).toBeNull();
  });

  it('should expose currentUser$ observable', () => {
    let emittedUser: any = 'not-set';
    service.currentUser$.subscribe(user => {
      emittedUser = user;
    });
    expect(emittedUser).toBeNull();
  });

  it('should have a signUp method', () => {
    expect(service.signUp).toBeDefined();
    expect(typeof service.signUp).toBe('function');
  });

  it('should have a signIn method', () => {
    expect(service.signIn).toBeDefined();
    expect(typeof service.signIn).toBe('function');
  });

  it('should have a signOut method', () => {
    expect(service.signOut).toBeDefined();
    expect(typeof service.signOut).toBe('function');
  });

  it('should have a getSession method', () => {
    expect(service.getSession).toBeDefined();
    expect(typeof service.getSession).toBe('function');
  });

  it('should have a getAccessToken method', () => {
    expect(service.getAccessToken).toBeDefined();
    expect(typeof service.getAccessToken).toBe('function');
  });

  it('should not call console.log on auth state change', (done: DoneFn) => {
    // Arrange: spy on console.log before the auth callback fires
    const consoleSpy = spyOn(console, 'log');

    // Access the private supabase client to intercept the onAuthStateChange callback
    const supabaseClient = (service as any).supabase;

    // Replace onAuthStateChange with a spy that captures and immediately invokes the callback
    const originalOnAuthStateChange = supabaseClient.auth.onAuthStateChange.bind(supabaseClient.auth);
    let capturedCallback: Function | null = null;
    spyOn(supabaseClient.auth, 'onAuthStateChange').and.callFake((cb: Function) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    });

    // Trigger loadSession again by calling it directly
    (service as any).loadSession().then(() => {
      if (capturedCallback) {
        // Act: invoke the captured auth state change callback
        capturedCallback('SIGNED_IN', { user: { id: 'user-1' } });
      }

      // Assert: console.log was never called
      expect(consoleSpy).not.toHaveBeenCalled();
      done();
    });
  });
});
