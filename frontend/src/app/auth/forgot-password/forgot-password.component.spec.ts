import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ForgotPasswordComponent } from './forgot-password.component';
import { environment } from '../../../environments/environment';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent, HttpClientTestingModule, RouterTestingModule]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Test 1: renders email input and submit button
  it('should render email input and submit button', () => {
    const emailInput: HTMLInputElement | null = fixture.nativeElement.querySelector('input[type="email"]');
    const submitBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');

    expect(emailInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();
  });

  // Test 2: submit button is disabled when email is empty
  it('should disable submit button when email is empty', () => {
    // Arrange
    component.email = '';

    // Act
    fixture.detectChanges();

    // Assert
    const submitBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBeTrue();
  });

  // Test 3: calls POST /api/auth/forgot-password with the entered email on submit
  it('should call POST /api/auth/forgot-password with entered email on submit', fakeAsync(() => {
    // Arrange
    component.email = 'test@example.com';
    fixture.detectChanges();

    // Act
    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    // Assert
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/forgot-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'test@example.com' });

    req.flush({});
    tick();
  }));

  // Test 4: shows success message after successful submit (hides form)
  it('should show success message and hide form after successful submit', fakeAsync(() => {
    // Arrange
    component.email = 'test@example.com';
    fixture.detectChanges();

    // Act
    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/forgot-password`);
    req.flush({});
    tick();
    fixture.detectChanges();

    // Assert
    const successMsg: HTMLElement | null = fixture.nativeElement.querySelector('.success-message');
    const formEl: HTMLFormElement | null = fixture.nativeElement.querySelector('form');
    expect(successMsg).not.toBeNull();
    expect(formEl).toBeNull();
  }));

  // Test 5: shows error message when API returns error
  it('should show error message when API returns error', fakeAsync(() => {
    // Arrange
    component.email = 'test@example.com';
    fixture.detectChanges();

    // Act
    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/forgot-password`);
    req.flush({ detail: 'User not found' }, { status: 404, statusText: 'Not Found' });
    tick();
    fixture.detectChanges();

    // Assert: always shows the generic message — never the API detail — to prevent enumeration
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.error-message');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Something went wrong. Please try again.');
  }));
});
