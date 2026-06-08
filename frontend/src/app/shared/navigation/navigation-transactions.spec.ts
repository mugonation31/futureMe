/**
 * Tests for the Transactions nav link (Task 26).
 * Uses AuthService instead of the stale SupabaseService mock.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { NavigationComponent } from './navigation.component';
import { AuthService, AuthUser } from '../../core/services/auth.service';

describe('NavigationComponent — Transactions link', () => {
  let component: NavigationComponent;
  let fixture: ComponentFixture<NavigationComponent>;
  let mockCurrentUser$: BehaviorSubject<AuthUser | null>;
  let mockAuthService: { currentUser$: BehaviorSubject<AuthUser | null>; logout: jasmine.Spy; getToken: jasmine.Spy; isAuthenticated: jasmine.Spy };

  const LOGGED_IN_USER: AuthUser = { id: 'u1', email: 'test@test.com', display_name: 'Tester' };

  beforeEach(async () => {
    mockCurrentUser$ = new BehaviorSubject<AuthUser | null>(null);
    mockAuthService = {
      currentUser$: mockCurrentUser$,
      logout: jasmine.createSpy('logout'),
      getToken: jasmine.createSpy('getToken').and.returnValue('fake-token'),
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [NavigationComponent, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavigationComponent);
    component = fixture.componentInstance;
  });

  // Test 1: Transactions link in desktop nav-links
  it('should render a Transactions link in the nav-links when user is logged in', () => {
    // Arrange: log in user
    mockCurrentUser$.next(LOGGED_IN_USER);
    fixture.detectChanges();

    // Assert
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('.nav-links a');
    const linkTexts = Array.from(links).map(a => a.textContent?.trim());
    expect(linkTexts).toContain('Transactions');
  });

  // Test 2: Transactions link has correct routerLink
  it('should have routerLink="/transactions" on the Transactions link', () => {
    // Arrange
    mockCurrentUser$.next(LOGGED_IN_USER);
    fixture.detectChanges();

    // Assert
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('.nav-links a');
    const txnLink = Array.from(links).find(a => a.textContent?.trim() === 'Transactions');
    expect(txnLink).not.toBeUndefined();
    expect(txnLink!.getAttribute('href')).toBe('/transactions');
  });
});
