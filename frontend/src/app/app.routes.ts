import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { DashboardComponent } from './dashboard/components/dashboard/dashboard.component';
import { SettingsPageComponent } from './settings/components/settings-page/settings-page.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { authGuard } from './auth/guards/auth.guard';
import { householdGuard } from './auth/guards/household.guard';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'signup', component: SignupComponent },
    { path: 'onboarding', component: OnboardingComponent, canActivate: [authGuard] },
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, householdGuard] },
    { path: 'settings', component: SettingsPageComponent, canActivate: [authGuard, householdGuard] },
    { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
