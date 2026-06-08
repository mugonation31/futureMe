import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { DashboardComponent } from './dashboard/components/dashboard/dashboard.component';
import { SettingsPageComponent } from './settings/components/settings-page/settings-page.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { TransactionListComponent } from './transactions/components/transaction-list/transaction-list.component';
import { authGuard } from './auth/guards/auth.guard';
import { householdGuard } from './auth/guards/household.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'onboarding', component: OnboardingComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, householdGuard] },
  { path: 'settings', component: SettingsPageComponent, canActivate: [authGuard, householdGuard] },
  { path: 'transactions', component: TransactionListComponent, canActivate: [authGuard, householdGuard] },
];
