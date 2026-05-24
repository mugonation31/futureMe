import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HouseholdService } from '../household/services/household.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss'
})
export class OnboardingComponent {
  householdName: string = '';
  inviteCode: string = '';

  createLoading: boolean = false;
  joinLoading: boolean = false;

  createError: string = '';
  joinError: string = '';

  constructor(
    private householdService: HouseholdService,
    private router: Router
  ) {}

  onCreateHousehold(): void {
    this.createError = '';
    this.createLoading = true;

    this.householdService.createHousehold(this.householdName).subscribe({
      next: () => {
        this.createLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.createLoading = false;
        this.createError = 'Failed to create household. Please try again.';
      }
    });
  }

  onJoinHousehold(): void {
    this.joinError = '';
    this.joinLoading = true;

    this.householdService.joinHousehold(this.inviteCode).subscribe({
      next: () => {
        this.joinLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.joinLoading = false;
        this.joinError = 'Failed to join household. Please check the invite code.';
      }
    });
  }
}
