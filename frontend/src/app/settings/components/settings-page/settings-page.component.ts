import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { UserSettings } from '../../models/settings.model';
import { BudgetAllocationComponent } from '../budget-allocation/budget-allocation.component';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BudgetAllocationComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss'
})
export class SettingsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);

  settingsForm!: FormGroup;
  successMessage = '';
  errorMessage = '';
  loading = false;

  ngOnInit() {
    this.initForm();
    this.loadSettings();
  }

  private initForm() {
    this.settingsForm = this.fb.group({
      display_name: [''],
      currency: ['GBP'],
      monthly_budget: [null],
    });
  }

  private loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: UserSettings) => {
        this.settingsForm.patchValue({
          display_name: settings.display_name || '',
          currency: settings.currency || 'GBP',
          monthly_budget: settings.monthly_budget ?? null,
        });
      },
      error: () => {
        // No settings yet — form stays at defaults
      }
    });
  }

  onSave() {
    this.successMessage = '';
    this.errorMessage = '';
    this.loading = true;

    const rawValue = this.settingsForm.value as Partial<UserSettings>;
    const payload = Object.fromEntries(
      Object.entries(rawValue).filter(([, v]) => v !== null && v !== undefined && v !== '')
    ) as Partial<UserSettings>;

    this.settingsService.updateSettings(payload).subscribe({
      next: () => {
        this.successMessage = 'Settings saved successfully';
        this.loading = false;
        setTimeout(() => { this.successMessage = ''; }, 3000);
      },
      error: () => {
        this.errorMessage = 'Failed to save settings. Please try again.';
        this.loading = false;
      }
    });
  }
}
