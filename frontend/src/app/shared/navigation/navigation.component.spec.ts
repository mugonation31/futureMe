import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { NavigationComponent } from './navigation.component';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import * as env from '../../../environments/environment';

describe('NavigationComponent', () => {
  let component: NavigationComponent;
  let fixture: ComponentFixture<NavigationComponent>;
  let mockCurrentUser$: BehaviorSubject<AuthUser | null>;
  let mockAuthService: { currentUser$: BehaviorSubject<AuthUser | null>; logout: jasmine.Spy; getToken: jasmine.Spy; isAuthenticated: jasmine.Spy };
  let router: Router;

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
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(NavigationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not show nav when user is not logged in', () => {
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeNull();
  });

  it('should show nav with user name when user is logged in', () => {
    mockCurrentUser$.next({
      id: '123',
      email: 'test@test.com',
      display_name: 'John Doe'
    });
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    const greeting = fixture.nativeElement.querySelector('.greeting');
    expect(greeting.textContent).toContain('John Doe');
  });

  it('should call logout and navigate to /login on logout', async () => {
    mockCurrentUser$.next({ id: '123', email: 'test@test.com', display_name: 'Test' });
    fixture.detectChanges();

    await component.logout();

    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should compile without errors when routerLinkActive is used in template (RouterLinkActive imported)', () => {
    mockCurrentUser$.next({ id: '123', email: 'test@test.com', display_name: 'Test' });

    expect(() => fixture.detectChanges()).not.toThrow();

    const links = fixture.nativeElement.querySelectorAll('a[routerLink]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should close the menu when a NavigationEnd event fires', () => {
    component.menuOpen = true;

    const routerEvents = (router as any).events as Subject<any>;
    routerEvents.next(new NavigationEnd(1, '/dashboard', '/dashboard'));

    expect(component.menuOpen).toBeFalse();
  });

  it('should display nav links for Dashboard, Transactions, Settings', () => {
    mockCurrentUser$.next({ id: '123', email: 'test@test.com', display_name: 'Test' });
    fixture.detectChanges();

    const navLinks = fixture.nativeElement.querySelectorAll('.nav-links a');
    const linkTexts = Array.from(navLinks).map((link: any) => link.textContent.trim());

    expect(linkTexts).toContain('Dashboard');
    expect(linkTexts).toContain('Transactions');
    expect(linkTexts).toContain('Settings');
  });
});
