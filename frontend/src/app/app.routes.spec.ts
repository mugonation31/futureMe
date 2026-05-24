import { routes } from './app.routes';
import { authGuard } from './auth/guards/auth.guard';
import { householdGuard } from './auth/guards/household.guard';

describe('App Routes', () => {
  it('should have routes configured', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('should have a default redirect to /dashboard', () => {
    const defaultRoute = routes.find(r => r.path === '');
    expect(defaultRoute).toBeTruthy();
    expect(defaultRoute?.redirectTo).toBe('/dashboard');
  });

  it('should have a login route', () => {
    const route = routes.find(r => r.path === 'login');
    expect(route).toBeTruthy();
  });

  it('should have a signup route', () => {
    const route = routes.find(r => r.path === 'signup');
    expect(route).toBeTruthy();
  });

  it('should have a dashboard route', () => {
    const route = routes.find(r => r.path === 'dashboard');
    expect(route).toBeTruthy();
  });

  it('should have a clients route', () => {
    const route = routes.find(r => r.path === 'clients');
    expect(route).toBeTruthy();
  });

  it('should have an invoices route', () => {
    const route = routes.find(r => r.path === 'invoices');
    expect(route).toBeTruthy();
  });

  it('should have a new invoice route', () => {
    const route = routes.find(r => r.path === 'invoices/new');
    expect(route).toBeTruthy();
  });

  it('should have an invoice detail route', () => {
    const route = routes.find(r => r.path === 'invoices/:id');
    expect(route).toBeTruthy();
  });

  it('should have a settings route', () => {
    const route = routes.find(r => r.path === 'settings');
    expect(route).toBeTruthy();
  });

  // AuthGuard tests for protected routes
  it('should have authGuard on dashboard route', () => {
    const route = routes.find(r => r.path === 'dashboard');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should have authGuard on clients route', () => {
    const route = routes.find(r => r.path === 'clients');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should have authGuard on invoices route', () => {
    const route = routes.find(r => r.path === 'invoices');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should have authGuard on settings route', () => {
    const route = routes.find(r => r.path === 'settings');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should NOT have authGuard on login route', () => {
    const route = routes.find(r => r.path === 'login');
    expect(route?.canActivate).toBeFalsy();
  });

  it('should NOT have authGuard on signup route', () => {
    const route = routes.find(r => r.path === 'signup');
    expect(route?.canActivate).toBeFalsy();
  });

  it('should have an onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route).toBeTruthy();
  });

  it('should have authGuard on onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should NOT have householdGuard on onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route?.canActivate).not.toContain(householdGuard);
  });
});
