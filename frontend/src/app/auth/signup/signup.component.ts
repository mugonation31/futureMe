import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  errorMessage = '';
  showPassword: Record<string, boolean> = {};

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  togglePasswordVisibility(field: string): void {
    this.showPassword[field] = !this.showPassword[field];
  }

  hasDigit(p: string): boolean {
    return /\d/.test(p);
  }

  hasSpecialChar(p: string): boolean {
    return /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(p);
  }

  private validateForm(): boolean {
    this.errorMessage = '';
    if (!this.firstName.trim()) {
      this.errorMessage = 'First name is required';
      return false;
    }
    if (!this.lastName.trim()) {
      this.errorMessage = 'Last name is required';
      return false;
    }
    if (!this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all fields';
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return false;
    }
    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return false;
    }
    if (!this.hasDigit(this.password) || !this.hasSpecialChar(this.password)) {
      this.errorMessage = 'Password must contain at least one digit and one special character (e.g. !, @, #).';
      return false;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return false;
    }
    return true;
  }

  async onSignup() {
    if (!this.validateForm()) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      await firstValueFrom(this.authService.register(this.email, this.password, this.firstName, this.lastName));
      this.router.navigate(['/onboarding']);
    } catch (error: any) {
      this.errorMessage = error.error?.detail || 'Registration failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
