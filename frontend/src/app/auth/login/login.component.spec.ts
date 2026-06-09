import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';
import { HouseholdService } from '../../household/services/household.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: { login: jasmine.Spy; isAuthenticated: jasmine.Spy };
  let mockHouseholdService: { getMyHousehold: jasmine.Spy };
  let router: Router;

  beforeEach(async () => {
    mockAuthService = {
      login: jasmine.createSpy('login').and.returnValue(of({ access_token: 'tok', user: { id: '1', email: 'a@b.com', display_name: null } })),
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(false)
    };
    mockHouseholdService = {
      getMyHousehold: jasmine.createSpy('getMyHousehold').and.returnValue(
        of({ id: 'hh1', name: 'Test House', invite_code: 'abc', created_at: '', created_by: 'u1' })
      )
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: HouseholdService, useValue: mockHouseholdService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 1: basic creation
  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // Test 2: navigates to /dashboard on successful login when household exists
  it('should navigate to /dashboard after successful login with household', async () => {
    component.email = 'test@example.com';
    component.password = 'password123';

    await component.onLogin();

    expect(mockAuthService.login).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  // Test 3: navigates to /onboarding when household is not found
  it('should navigate to /onboarding when household returns 404', async () => {
    mockHouseholdService.getMyHousehold.and.returnValue(throwError(() => ({ status: 404 })));
    component.email = 'test@example.com';
    component.password = 'password123';

    await component.onLogin();

    expect(router.navigate).toHaveBeenCalledWith(['/onboarding']);
  });

  // Test 4: shows error message on failed login
  it('should show error message on failed login', async () => {
    mockAuthService.login.and.returnValue(throwError(() => new Error('Unauthorized')));
    component.email = 'test@example.com';
    component.password = 'wrongpassword';

    await component.onLogin();

    expect(component.errorMessage).toBe('Invalid email or password');
  });

  // Test 5: disabled state
  it('should disable submit button when loading is true', () => {
    component.loading = true;
    fixture.detectChanges();

    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBeTrue();
  });

  // Test 13: shows "Forgot password?" link
  it('should show "Forgot password?" link', () => {
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('a');
    const forgotLink = Array.from(links).find(
      (a: HTMLAnchorElement) => a.textContent?.includes('Forgot password?')
    );
    expect(forgotLink).not.toBeUndefined();
  });

  // Test 15: does NOT show success banner when no query param
  it('should NOT show success banner when no query param is present', () => {
    const banner: HTMLElement | null = fixture.nativeElement.querySelector('.success-banner');
    expect(banner).toBeNull();
  });

  // Test 13 (new): showPassword initial state is falsy for 'password' field
  it('should have falsy initial state for showPassword["password"]', () => {
    // Assert
    expect(component.showPassword['password']).toBeFalsy();
  });

  // Test 14 (new): togglePasswordVisibility toggles showPassword for 'password' field
  it('should toggle showPassword["password"] when togglePasswordVisibility is called', () => {
    // Arrange
    expect(component.showPassword['password']).toBeFalsy();

    // Act
    component.togglePasswordVisibility('password');

    // Assert
    expect(component.showPassword['password']).toBeTrue();

    // Act again
    component.togglePasswordVisibility('password');

    // Assert
    expect(component.showPassword['password']).toBeFalse();
  });
});

// Test 14 in its own describe to avoid TestBed.resetTestingModule() inside it()
describe('LoginComponent — reset=success banner', () => {
  it('should show success banner when ?reset=success query param is present', async () => {
    const mockAuth = {
      login: jasmine.createSpy('login'),
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(false)
    };
    const mockHousehold = { getMyHousehold: jasmine.createSpy('getMyHousehold') };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: HouseholdService, useValue: mockHousehold },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'reset' ? 'success' : null } } }
        }
      ]
    }).compileComponents();

    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();

    const banner: HTMLElement | null = f.nativeElement.querySelector('.success-banner');
    expect(banner).not.toBeNull();
  });
});
