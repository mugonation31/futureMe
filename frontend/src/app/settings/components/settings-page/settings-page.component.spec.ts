import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { SettingsPageComponent } from './settings-page.component';
import { SettingsService } from '../../services/settings.service';
import { UserSettings } from '../../models/settings.model';

describe('SettingsPageComponent', () => {
  let component: SettingsPageComponent;
  let fixture: ComponentFixture<SettingsPageComponent>;
  let mockSettingsService: {
    getSettings: jasmine.Spy;
    updateSettings: jasmine.Spy;
  };

  const mockSettings: UserSettings = {
    user_id: 'user-123',
    display_name: 'Alice',
    currency: 'GBP',
    monthly_budget: 2000,
    created_at: '2026-01-15T10:00:00',
    updated_at: '2026-01-15T10:00:00',
  };

  beforeEach(async () => {
    mockSettingsService = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(of(mockSettings)),
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of(mockSettings)),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent, ReactiveFormsModule],
      providers: [
        { provide: SettingsService, useValue: mockSettingsService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Test 1: should create the component
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 2: should have futureMe settings form fields
  it('should have display_name, currency, and monthly_budget form controls', () => {
    expect(component.settingsForm.get('display_name')).toBeTruthy();
    expect(component.settingsForm.get('currency')).toBeTruthy();
    expect(component.settingsForm.get('monthly_budget')).toBeTruthy();
  });

  // Test 3: should call updateSettings on form submit
  it('should call updateSettings on form submit', () => {
    // Arrange
    component.settingsForm.patchValue({
      display_name: 'Bob',
      currency: 'USD',
      monthly_budget: 3000,
    });

    // Act
    component.onSave();

    // Assert
    expect(mockSettingsService.updateSettings).toHaveBeenCalled();
  });

  // Test 4: should show success message after save
  it('should show success message after save', fakeAsync(() => {
    // Arrange
    component.settingsForm.patchValue({ display_name: 'Test' });

    // Act
    component.onSave();
    tick();

    // Assert — message is visible immediately after save
    expect(component.successMessage).toBeTruthy();

    // Drain the 3-second auto-dismiss timer so the zone is clean
    tick(3000);
  }));

  // Test 5: should load existing settings on init
  it('should load existing settings on init', () => {
    // Assert - settings should be loaded from service
    expect(mockSettingsService.getSettings).toHaveBeenCalled();
    expect(component.settingsForm.get('display_name')?.value).toBe('Alice');
    expect(component.settingsForm.get('currency')?.value).toBe('GBP');
    expect(component.settingsForm.get('monthly_budget')?.value).toBe(2000);
  });

  // Test 6: should show error message on save failure
  it('should show error message on save failure', fakeAsync(() => {
    // Arrange
    mockSettingsService.updateSettings.and.returnValue(throwError(() => new Error('Save failed')));
    component.settingsForm.patchValue({ display_name: 'Test' });

    // Act
    component.onSave();
    tick();

    // Assert
    expect(component.errorMessage).toBeTruthy();
  }));

  // Test 7 (Task 28): success message auto-dismisses after 3 seconds
  it('should auto-dismiss success message after 3 seconds', fakeAsync(() => {
    // Arrange
    component.settingsForm.patchValue({ display_name: 'Test' });

    // Act
    component.onSave();
    tick();
    expect(component.successMessage).toBeTruthy(); // visible immediately

    tick(3000); // advance 3 seconds

    // Assert
    expect(component.successMessage).toBe('');
  }));

  // Test 8 (Task 28): updateSettings should not include null fields
  it('should filter out null values before calling updateSettings', () => {
    // Arrange: only display_name is filled; monthly_budget is null
    component.settingsForm.setValue({ display_name: 'Carol', currency: 'GBP', monthly_budget: null });

    // Act
    component.onSave();

    // Assert: the payload passed to updateSettings should not have monthly_budget key (or have it as undefined)
    const callArg = mockSettingsService.updateSettings.calls.mostRecent().args[0];
    expect(callArg).not.toEqual(jasmine.objectContaining({ monthly_budget: null }));
  });
});
