import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { DashboardComponent } from './dashboard/components/dashboard/dashboard.component';
import { SettingsPageComponent } from './settings/components/settings-page/settings-page.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { DebtsComponent } from './debts/debts.component';
import { MoneyPlanComponent } from './money-plan/money-plan.component';
import { EmergencyFundComponent } from './emergency-fund/emergency-fund.component';
import { OpportunitiesComponent } from './opportunities/opportunities.component';
import { MonthlyReviewComponent } from './monthly-review/monthly-review.component';
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
  { path: 'debts', component: DebtsComponent, canActivate: [authGuard, householdGuard] },
  { path: 'money-plan', component: MoneyPlanComponent, canActivate: [authGuard, householdGuard] },
  { path: 'emergency-fund', component: EmergencyFundComponent, canActivate: [authGuard, householdGuard] },
  { path: 'opportunities', component: OpportunitiesComponent, canActivate: [authGuard, householdGuard] },
  { path: 'monthly-review', component: MonthlyReviewComponent, canActivate: [authGuard, householdGuard] },
];
