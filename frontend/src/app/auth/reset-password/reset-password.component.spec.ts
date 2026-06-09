import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ResetPasswordComponent } from './reset-password.component';
import { environment } from '../../../environments/environment';

async function createFixture(token: string | null): Promise<{
  fixture: ComponentFixture<ResetPasswordComponent>;
  component: ResetPasswordComponent;
  httpMock: HttpTestingController;
  router: Router;
}> {
  await TestBed.configureTestingModule({
    imports: [ResetPasswordComponent, HttpClientTestingModule, RouterTestingModule],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: { get: (key: string) => key === 'token' ? token : null } }
        }
      }
    ]
  }).compileComponents();

  const httpMock = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  spyOn(router, 'navigate');
  const fixture = TestBed.createComponent(ResetPasswordComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, httpMock, router };
}

describe('ResetPasswordComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // Test 6: shows error message immediately if no token in query params
  it('should show error message immediately if no token in query params', async () => {
    const { fixture, httpMock } = await createFixture(null);

    // Assert
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.error-message');
    const formEl: HTMLFormElement | null = fixture.nativeElement.querySelector('form');

    expect(errorEl).not.toBeNull();
    expect(formEl).toBeNull();

    httpMock.verify();
  });

  // Test 7: renders password form when token is present in query params
  it('should render password form when token is present in query params', async () => {
    const { fixture, httpMock } = await createFixture('valid-token-abc');

    const formEl: HTMLFormElement | null = fixture.nativeElement.querySelector('form');
    const passwordInput: HTMLInputElement | null = fixture.nativeElement.querySelector('input[name="newPassword"]');
    const confirmInput: HTMLInputElement | null = fixture.nativeElement.querySelector('input[name="confirmPassword"]');

    expect(formEl).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(confirmInput).not.toBeNull();

    httpMock.verify();
  });

  // Test 8: submit button disabled when passwords don't match
  it('should disable submit button when passwords do not match', async () => {
    const { fixture, component, httpMock } = await createFixture('valid-token-abc');

    component.newPassword = 'password1';
    component.confirmPassword = 'password2';
    fixture.detectChanges();

    const submitBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBeTrue();

    httpMock.verify();
  });

  // Test 9: submit button disabled when password < 6 chars
  it('should disable submit button when password is less than 6 characters', async () => {
    const { fixture, component, httpMock } = await createFixture('valid-token-abc');

    component.newPassword = 'abc';
    component.confirmPassword = 'abc';
    fixture.detectChanges();

    const submitBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBeTrue();

    httpMock.verify();
  });

  // Test 10: calls POST /api/auth/reset-password with token and new_password on valid submit
  it('should call POST /api/auth/reset-password with token and new_password on valid submit', fakeAsync(async () => {
    const { fixture, component, httpMock } = await createFixture('valid-token-abc');

    component.newPassword = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'valid-token-abc', new_password: 'newpassword123' });

    req.flush({});
    tick();
    httpMock.verify();
  }));

  // Test 11: navigates to /login?reset=success on 200 response
  it('should navigate to /login?reset=success on 200 response', fakeAsync(async () => {
    const { fixture, component, httpMock, router } = await createFixture('valid-token-abc');

    component.newPassword = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    req.flush({});
    tick();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reset: 'success' } });
    httpMock.verify();
  }));

  // Test 12: shows error message on 400 response
  it('should show error message on 400 response', fakeAsync(async () => {
    const { fixture, component, httpMock } = await createFixture('expired-token');

    component.newPassword = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    req.flush({ detail: 'Token expired or already used' }, { status: 400, statusText: 'Bad Request' });
    tick();
    fixture.detectChanges();

    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.error-message');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('This reset link is invalid or has already been used.');
    httpMock.verify();
  }));

  // Test 15 (new): togglePasswordVisibility toggles showPassword for 'newPassword' field
  it('should toggle showPassword["newPassword"] when togglePasswordVisibility is called with "newPassword"', async () => {
    const { component, httpMock } = await createFixture('valid-token-abc');

    // Arrange
    expect(component.showPassword['newPassword']).toBeFalsy();

    // Act
    component.togglePasswordVisibility('newPassword');

    // Assert
    expect(component.showPassword['newPassword']).toBeTrue();

    // Act again
    component.togglePasswordVisibility('newPassword');

    // Assert
    expect(component.showPassword['newPassword']).toBeFalse();

    httpMock.verify();
  });

  // Test 16 (new): togglePasswordVisibility toggles showPassword for 'confirmPassword' independently
  it('should toggle showPassword["confirmPassword"] independently of showPassword["newPassword"]', async () => {
    const { component, httpMock } = await createFixture('valid-token-abc');

    // Arrange: toggle newPassword first
    component.togglePasswordVisibility('newPassword');
    expect(component.showPassword['newPassword']).toBeTrue();
    expect(component.showPassword['confirmPassword']).toBeFalsy();

    // Act
    component.togglePasswordVisibility('confirmPassword');

    // Assert: confirmPassword toggled, newPassword unchanged
    expect(component.showPassword['confirmPassword']).toBeTrue();
    expect(component.showPassword['newPassword']).toBeTrue();

    httpMock.verify();
  });
});
