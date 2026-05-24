import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { HouseholdService } from '../../household/services/household.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Form fields - bound to HTML inputs via [(ngModel)]
  email: string = '';
  password: string = '';

  // UI state - controls what user sees
  loading: boolean = false;
  errorMessage: string = '';

  constructor(
    private supabaseService: SupabaseService,
    private householdService: HouseholdService,
    private router: Router
  ) {
    // If already logged in, redirect to dashboard
    this.supabaseService.currentUserAfterLoad$().subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  /**
   * Validates the login form
   * Returns true if valid, false otherwise
   */
  private validateForm(): boolean {
    this.errorMessage = '';

    // Check both fields are filled
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter email and password';
      return false;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = 'Please enter a valid email';
      return false;
    }

    return true;
  }

  /**
   * Handle login form submission
   */
  async onLogin() {
    // Validate first
    if (!this.validateForm()) {
      return;
    }

    try {
      this.loading = true;
      this.errorMessage = '';

      // Call SupabaseService to authenticate
      await this.supabaseService.signIn(this.email, this.password);

      // Check if user has a household to determine navigation target
      try {
        await firstValueFrom(this.householdService.getMyHousehold());
        this.router.navigate(['/dashboard']);
      } catch {
        this.router.navigate(['/onboarding']);
      }

    } catch (error: any) {
      // Show generic error (security: don't reveal if email exists or not)
      this.errorMessage = 'Invalid email or password';
    } finally {
      this.loading = false;
    }
  }
}
