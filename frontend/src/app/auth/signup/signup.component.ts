import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  // Form fields
  name: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';

  // UI state
  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  constructor(
    private supabaseService: SupabaseService,
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
   * Validates the signup form
   */
  private validateForm(): boolean {
    this.errorMessage = '';

    // Check all fields are filled
    if (!this.name || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all fields';
      return false;
    }

    // Check name length
    if (this.name.trim().length < 2) {
      this.errorMessage = 'Name must be at least 2 characters';
      return false;
    }

    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return false;
    }

    // Check password length
    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return false;
    }

    // Check passwords match
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return false;
    }

    return true;
  }

  /**
   * Handle signup form submission
   */
  async onSignup() {
    if (!this.validateForm()) {
      return;
    }

    try {
      this.loading = true;
      this.errorMessage = '';
      this.successMessage = '';

      await this.supabaseService.signUp(this.email, this.password, this.name);

      this.successMessage = 'Account created! Redirecting to setup...';

      // Navigate immediately to onboarding — no setTimeout delay
      this.router.navigate(['/onboarding']);

    } catch (error: any) {
      this.errorMessage = error.message || 'Signup failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
