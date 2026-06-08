import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { SignupComponent } from './signup.component';
import { AuthService } from '../../core/services/auth.service';

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;
  let mockAuthService: { register: jasmine.Spy; isAuthenticated: jasmine.Spy };
  let router: Router;

  beforeEach(async () => {
    mockAuthService = {
      register: jasmine.createSpy('register').and.returnValue(of({ access_token: 'tok', user: { id: '1', email: 'a@b.com', display_name: null } })),
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(false)
    };

    await TestBed.configureTestingModule({
      imports: [SignupComponent, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 1: basic creation
  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  // Test 2: error message display
  it('should show error message when errorMessage is set', () => {
    // Arrange
    component.errorMessage = 'Please fill in all fields';

    // Act
    fixture.detectChanges();

    // Assert
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.error-message');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Please fill in all fields');
  });

  // Test 3: disabled state
  it('should disable submit button when loading is true', () => {
    // Arrange
    component.loading = true;

    // Act
    fixture.detectChanges();

    // Assert
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBeTrue();
  });

  // Test 4 (RED → GREEN after HTML change): btn-primary class present
  it('should have btn-primary class on the submit button', () => {
    // Arrange / Act: default render

    // Assert
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button.btn-primary');
    expect(btn).not.toBeNull();
  });

  // Test 5 (RED → GREEN after HTML change): old signup-button class removed
  it('should not have signup-button class on the submit button', () => {
    // Arrange / Act: default render

    // Assert
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button.signup-button');
    expect(btn).toBeNull();
  });
});
