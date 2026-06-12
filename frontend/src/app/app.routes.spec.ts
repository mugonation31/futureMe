import { routes } from './app.routes';
import { authGuard } from './auth/guards/auth.guard';
import { householdGuard } from './auth/guards/household.guard';

describe('App Routes', () => {
  // Test 1: routes exist
  it('should have routes configured', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  // Test 2: root route goes to landing page
  it('should have a root route pointing to the landing page', () => {
    const defaultRoute = routes.find(r => r.path === '');
    expect(defaultRoute).toBeTruthy();
  });

  // Test 3: public auth routes exist
  it('should have a login route', () => {
    const route = routes.find(r => r.path === 'login');
    expect(route).toBeTruthy();
  });

  it('should have a signup route', () => {
    const route = routes.find(r => r.path === 'signup');
    expect(route).toBeTruthy();
  });

  it('should have a forgot-password route', () => {
    const route = routes.find(r => r.path === 'forgot-password');
    expect(route).toBeTruthy();
  });

  it('should have a reset-password route', () => {
    const route = routes.find(r => r.path === 'reset-password');
    expect(route).toBeTruthy();
  });

  // Test 4: core app routes exist
  it('should have a dashboard route', () => {
    const route = routes.find(r => r.path === 'dashboard');
    expect(route).toBeTruthy();
  });

  it('should have a settings route', () => {
    const route = routes.find(r => r.path === 'settings');
    expect(route).toBeTruthy();
  });

  it('should have an onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route).toBeTruthy();
  });

  // Test 5: authGuard on protected routes
  it('should have authGuard on dashboard route', () => {
    const route = routes.find(r => r.path === 'dashboard');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should have authGuard on settings route', () => {
    const route = routes.find(r => r.path === 'settings');
    expect(route?.canActivate).toContain(authGuard);
  });

  it('should have authGuard on onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route?.canActivate).toContain(authGuard);
  });

  // Test 6: householdGuard on guarded routes
  it('should have householdGuard on dashboard route', () => {
    const route = routes.find(r => r.path === 'dashboard');
    expect(route?.canActivate).toContain(householdGuard);
  });

  it('should have householdGuard on settings route', () => {
    const route = routes.find(r => r.path === 'settings');
    expect(route?.canActivate).toContain(householdGuard);
  });

  // Test 7: public routes have NO authGuard
  it('should NOT have authGuard on login route', () => {
    const route = routes.find(r => r.path === 'login');
    expect(route?.canActivate).toBeFalsy();
  });

  it('should NOT have authGuard on signup route', () => {
    const route = routes.find(r => r.path === 'signup');
    expect(route?.canActivate).toBeFalsy();
  });

  // Test 8: onboarding does NOT have householdGuard (user is setting it up)
  it('should NOT have householdGuard on onboarding route', () => {
    const route = routes.find(r => r.path === 'onboarding');
    expect(route?.canActivate).not.toContain(householdGuard);
  });
});
