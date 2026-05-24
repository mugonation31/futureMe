import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { SettingsPageComponent } from './settings-page.component';
import { SettingsService } from '../../services/settings.service';
import { CompanySettings } from '../../models/settings.model';

describe('SettingsPageComponent', () => {
  let component: SettingsPageComponent;
  let fixture: ComponentFixture<SettingsPageComponent>;
  let mockSettingsService: {
    getSettings: jasmine.Spy;
    updateSettings: jasmine.Spy;
  };

  const mockSettings: CompanySettings = {
    id: 'settings-123',
    company_name: 'My Company Ltd',
    company_email: 'info@mycompany.com',
    company_phone: '020-1234-5678',
    bank_account_name: 'My Company Ltd',
    bank_name: 'Barclays',
    account_number: '12345678',
    sort_code: '20-30-40',
    iban: 'GB29NWBK60161331926819',
    user_id: 'user-123',
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

  // Test 9: should create the component
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 10: should have company details and payment details form sections
  it('should have company details and payment details form groups', () => {
    expect(component.settingsForm.get('company_name')).toBeTruthy();
    expect(component.settingsForm.get('company_email')).toBeTruthy();
    expect(component.settingsForm.get('company_phone')).toBeTruthy();
    expect(component.settingsForm.get('bank_account_name')).toBeTruthy();
    expect(component.settingsForm.get('bank_name')).toBeTruthy();
    expect(component.settingsForm.get('account_number')).toBeTruthy();
    expect(component.settingsForm.get('sort_code')).toBeTruthy();
    expect(component.settingsForm.get('iban')).toBeTruthy();
  });

  // Test 11: should call updateSettings on form submit
  it('should call updateSettings on form submit', () => {
    // Arrange
    component.settingsForm.patchValue({
      company_name: 'Updated Company',
      bank_name: 'HSBC',
    });

    // Act
    component.onSave();

    // Assert
    expect(mockSettingsService.updateSettings).toHaveBeenCalled();
  });

  // Test 12: should show success message after save
  it('should show success message after save', fakeAsync(() => {
    // Arrange
    component.settingsForm.patchValue({ company_name: 'Test' });

    // Act
    component.onSave();
    tick();

    // Assert
    expect(component.successMessage).toBeTruthy();
  }));

  // Test 13: should load existing settings on init
  it('should load existing settings on init', () => {
    // Assert - settings should be loaded from service
    expect(mockSettingsService.getSettings).toHaveBeenCalled();
    expect(component.settingsForm.get('company_name')?.value).toBe('My Company Ltd');
    expect(component.settingsForm.get('bank_name')?.value).toBe('Barclays');
  });

  // Test 14: should show error message on save failure
  it('should show error message on save failure', fakeAsync(() => {
    // Arrange
    mockSettingsService.updateSettings.and.returnValue(throwError(() => new Error('Save failed')));
    component.settingsForm.patchValue({ company_name: 'Test' });

    // Act
    component.onSave();
    tick();

    // Assert
    expect(component.errorMessage).toBeTruthy();
  }));
});
