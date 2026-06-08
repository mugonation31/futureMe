import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { HouseholdService } from '../../household/services/household.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  resetSuccess = false;

  constructor(
    private authService: AuthService,
    private householdService: HouseholdService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngOnInit() {
    this.resetSuccess = this.route.snapshot.queryParamMap.get('reset') === 'success';
  }

  private validateForm(): boolean {
    this.errorMessage = '';
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter email and password';
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.errorMessage = 'Please enter a valid email';
      return false;
    }
    return true;
  }

  async onLogin() {
    if (!this.validateForm()) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      await firstValueFrom(this.authService.login(this.email, this.password));
      try {
        await firstValueFrom(this.householdService.getMyHousehold());
        this.router.navigate(['/dashboard']);
      } catch {
        this.router.navigate(['/onboarding']);
      }
    } catch {
      this.errorMessage = 'Invalid email or password';
    } finally {
      this.loading = false;
    }
  }
}
