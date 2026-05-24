import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { OnboardingComponent } from './onboarding.component';
import { HouseholdService } from '../household/services/household.service';

describe('OnboardingComponent', () => {
  let component: OnboardingComponent;
  let fixture: ComponentFixture<OnboardingComponent>;
  let mockHouseholdService: { createHousehold: jasmine.Spy; joinHousehold: jasmine.Spy };
  let router: Router;

  const mockHousehold = {
    id: 'household-123',
    name: 'The Smiths',
    invite_code: 'ABC123',
    created_at: '2026-01-15T10:00:00',
    created_by: 'user-123'
  };

  beforeEach(async () => {
    mockHouseholdService = {
      createHousehold: jasmine.createSpy('createHousehold').and.returnValue(of(mockHousehold)),
      joinHousehold: jasmine.createSpy('joinHousehold').and.returnValue(of(mockHousehold))
    };

    await TestBed.configureTestingModule({
      imports: [OnboardingComponent, RouterTestingModule],
      providers: [
        { provide: HouseholdService, useValue: mockHouseholdService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 1: should create the component
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 2: should call createHousehold and navigate to /dashboard on success
  it('should call createHousehold and navigate to /dashboard on success', () => {
    // Arrange
    component.householdName = 'The Smiths';

    // Act
    component.onCreateHousehold();

    // Assert
    expect(mockHouseholdService.createHousehold).toHaveBeenCalledWith('The Smiths');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  // Test 3: should show error message when createHousehold fails
  it('should show error message when createHousehold fails', () => {
    // Arrange
    mockHouseholdService.createHousehold.and.returnValue(
      throwError(() => new Error('Server error'))
    );
    component.householdName = 'The Smiths';

    // Act
    component.onCreateHousehold();

    // Assert
    expect(component.createError).toBe('Failed to create household. Please try again.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // Test 4: should call joinHousehold and navigate to /dashboard on success
  it('should call joinHousehold and navigate to /dashboard on success', () => {
    // Arrange
    component.inviteCode = 'ABC123';

    // Act
    component.onJoinHousehold();

    // Assert
    expect(mockHouseholdService.joinHousehold).toHaveBeenCalledWith('ABC123');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  // Test 5: should show error message when joinHousehold fails
  it('should show error message when joinHousehold fails', () => {
    // Arrange
    mockHouseholdService.joinHousehold.and.returnValue(
      throwError(() => new Error('Invalid invite code'))
    );
    component.inviteCode = 'BADCODE';

    // Act
    component.onJoinHousehold();

    // Assert
    expect(component.joinError).toBe('Failed to join household. Please check the invite code.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
