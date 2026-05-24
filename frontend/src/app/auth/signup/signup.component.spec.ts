import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { SignupComponent } from './signup.component';
import { SupabaseService } from '../../core/services/supabase.service';

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;
  let mockSupabaseService: { signUp: jasmine.Spy; currentUserAfterLoad$: jasmine.Spy };
  let router: Router;

  beforeEach(async () => {
    mockSupabaseService = {
      signUp: jasmine.createSpy('signUp').and.returnValue(Promise.resolve({})),
      currentUserAfterLoad$: jasmine.createSpy('currentUserAfterLoad$').and.returnValue(of(null))
    };

    await TestBed.configureTestingModule({
      imports: [SignupComponent, RouterTestingModule],
      providers: [
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty form fields initially', () => {
    expect(component.name).toBe('');
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
  });

  it('should display error when fields are empty on submit', async () => {
    // Arrange: leave all fields empty

    // Act
    await component.onSignup();

    // Assert
    expect(component.errorMessage).toBe('Please fill in all fields');
    expect(mockSupabaseService.signUp).not.toHaveBeenCalled();
  });

  it('should display error for invalid email format', async () => {
    // Arrange
    component.name = 'Test User';
    component.email = 'bad-email';
    component.password = 'password123';
    component.confirmPassword = 'password123';

    // Act
    await component.onSignup();

    // Assert
    expect(component.errorMessage).toBe('Please enter a valid email address');
  });

  it('should display error when password is less than 6 characters', async () => {
    // Arrange
    component.name = 'Test User';
    component.email = 'test@test.com';
    component.password = '12345';
    component.confirmPassword = '12345';

    // Act
    await component.onSignup();

    // Assert
    expect(component.errorMessage).toBe('Password must be at least 6 characters');
  });

  it('should display error when passwords do not match', async () => {
    // Arrange
    component.name = 'Test User';
    component.email = 'test@test.com';
    component.password = 'password123';
    component.confirmPassword = 'different123';

    // Act
    await component.onSignup();

    // Assert
    expect(component.errorMessage).toBe('Passwords do not match');
  });

  it('should call signUp and show success message on success', async () => {
    // Arrange
    component.name = 'Test User';
    component.email = 'test@test.com';
    component.password = 'password123';
    component.confirmPassword = 'password123';

    // Act
    await component.onSignup();

    // Assert
    expect(mockSupabaseService.signUp).toHaveBeenCalledWith('test@test.com', 'password123', 'Test User');
    expect(component.successMessage).toBe('Account created! Redirecting to setup...');
  });

  it('should display error on failed signup', async () => {
    // Arrange
    mockSupabaseService.signUp.and.returnValue(Promise.reject({ message: 'Email already exists' }));
    component.name = 'Test User';
    component.email = 'test@test.com';
    component.password = 'password123';
    component.confirmPassword = 'password123';

    // Act
    await component.onSignup();

    // Assert
    expect(component.errorMessage).toBe('Email already exists');
  });

  it('should navigate to /onboarding immediately after successful signup', async () => {
    // Arrange
    component.name = 'Test User';
    component.email = 'test@test.com';
    component.password = 'password123';
    component.confirmPassword = 'password123';

    // Act
    await component.onSignup();

    // Assert: navigate called immediately — no setTimeout delay
    expect(router.navigate).toHaveBeenCalledWith(['/onboarding']);
  });
});
