import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { SettingsService } from '../../../settings/services/settings.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: { getStats: jasmine.Spy };
  let mockSettingsService: { getSettings: jasmine.Spy };

  const mockStats: DashboardStats = {
    total_income: 3000,
    total_expenses: 1200,
    net_position: 1800,
    emergency_fund_status: { current_amount: 500, target_amount: 3600, months_covered: 0.42 },
    debt_summary: { total_owed: 5000, total_minimum_payments: 150, debt_count: 1 },
    savings_progress: [{ goal_name: 'Holiday', target_amount: 2000, current_amount: 500, percent: 25 }],
  };

  beforeEach(async () => {
    mockDashboardService = {
      getStats: jasmine.createSpy('getStats').and.returnValue(of(mockStats)),
    };
    mockSettingsService = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(
        of({ currency: 'GBP', display_name: null, monthly_budget: null })
      ),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getStats() on ngOnInit', () => {
    fixture.detectChanges();
    expect(mockDashboardService.getStats).toHaveBeenCalled();
  });

  it('should set stats after successful load', () => {
    fixture.detectChanges();
    expect(component.stats).toEqual(mockStats);
    expect(component.loading).toBeFalse();
  });

  // Test 1: should display loading state initially
  it('should display loading state initially', () => {
    // Use a Subject so the observable does not emit synchronously,
    // allowing us to capture the in-flight loading state.
    const statsSubject = new Subject<DashboardStats>();
    mockDashboardService.getStats.and.returnValue(statsSubject.asObservable());
    fixture.detectChanges(); // triggers ngOnInit → loading = true, no response yet
    const loadingEl = fixture.nativeElement.querySelector('.loading');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl.textContent).toContain('Loading');
    statsSubject.complete(); // clean up
  });

  // Test 2: should display net position after data loads
  it('should display net position after data loads', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('1,800');
  });

  // Test 3: should apply 'positive' CSS class when net_position >= 0
  it("should apply 'positive' CSS class when net_position >= 0", () => {
    fixture.detectChanges();
    expect(component.netPositionClass).toBe('positive');
    const netCard = fixture.nativeElement.querySelector('.positive');
    expect(netCard).toBeTruthy();
  });

  // Test 4: should apply 'caution' CSS class when net_position < 0
  it("should apply 'caution' CSS class when net_position < 0", () => {
    const negativeStats: DashboardStats = { ...mockStats, net_position: -200 };
    mockDashboardService.getStats.and.returnValue(of(negativeStats));
    fixture.detectChanges();
    expect(component.netPositionClass).toBe('caution');
    const cautionCard = fixture.nativeElement.querySelector('.caution');
    expect(cautionCard).toBeTruthy();
  });

  // Test 5: should display debt summary total_owed
  it('should display debt summary total_owed', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('5,000');
  });

  // Test 6: should display emergency fund progress bar at correct width
  it('should display emergency fund progress bar at correct width', () => {
    fixture.detectChanges();
    // 500 / 3600 = 13.89%
    const expectedPercent = Math.min((500 / 3600) * 100, 100);
    expect(component.emergencyFundPercent).toBeCloseTo(expectedPercent, 1);
    const progressFill = fixture.nativeElement.querySelector('.progress-fill');
    expect(progressFill).toBeTruthy();
  });

  // Test 7: should display savings goals list
  it('should display savings goals list', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Holiday');
  });

  // Test 8: should show empty state when no savings goals
  it('should show empty state when no savings goals', () => {
    const emptyStats: DashboardStats = { ...mockStats, savings_progress: [] };
    mockDashboardService.getStats.and.returnValue(of(emptyStats));
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No savings goals');
  });

  // Test 9: should display error message when service fails
  it('should display error message when service fails', () => {
    mockDashboardService.getStats.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    const errorEl = fixture.nativeElement.querySelector('.error-text');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Failed to load dashboard');
  });

  // Test 10: should show quick links to all 5 screens
  it('should show quick links to all 5 screens', () => {
    fixture.detectChanges();
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('a[href]');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/money-plan');
    expect(hrefs).toContain('/debts');
    expect(hrefs).toContain('/emergency-fund');
    expect(hrefs).toContain('/monthly-review');
    expect(hrefs).toContain('/opportunities');
  });
});
