import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  token: string | null = null;
  newPassword = '';
  confirmPassword = '';
  loading = false;
  errorMessage = '';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.errorMessage = 'Invalid or missing reset token. Please request a new password reset.';
    }
  }

  get passwordsValid(): boolean {
    return this.newPassword.length >= 6 && this.newPassword === this.confirmPassword;
  }

  onSubmit() {
    if (!this.passwordsValid || !this.token) return;
    this.loading = true;
    this.errorMessage = '';
    this.http.post(`${environment.apiUrl}/auth/reset-password`, {
      token: this.token,
      new_password: this.newPassword
    }).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/login'], { queryParams: { reset: 'success' } });
      },
      error: (err) => {
        this.errorMessage = err.status === 400
          ? 'This reset link is invalid or has already been used.'
          : 'Something went wrong. Please try again.';
        this.loading = false;
      }
    });
  }
}
