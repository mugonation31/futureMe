import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { SettingsService } from '../../../settings/services/settings.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: { getStats: jasmine.Spy };
  let mockSettingsService: { getSettings: jasmine.Spy };

  const mockStats: DashboardStats = {
    total_budget: 5000,
    total_spent: 1200,
    remaining_budget: 3800,
    savings_rate: 24,
    category_breakdown: [
      { category_name: 'Groceries', spent: 800, budget: 1000 },
      { category_name: 'Transport', spent: 400, budget: null },
    ],
  };

  const zeroStats: DashboardStats = {
    total_budget: 0,
    total_spent: 0,
    remaining_budget: 0,
    savings_rate: 0,
    category_breakdown: [],
  };

  function createComponent(stats: DashboardStats) {
    mockDashboardService = {
      getStats: jasmine.createSpy('getStats').and.returnValue(of(stats)),
    };
    mockSettingsService = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(
        of({ currency: 'GBP', display_name: null, monthly_budget: null })
      ),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    });
  }

  beforeEach(async () => {
    await createComponent(mockStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  // Test 1: component creation
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 2: loads stats on init
  it('should call getStats() on ngOnInit', () => {
    fixture.detectChanges();
    expect(mockDashboardService.getStats).toHaveBeenCalled();
  });

  // Test 3: renders the four stat cards
  it('should render stat cards when stats are loaded', () => {
    fixture.detectChanges();
    const statCards = fixture.nativeElement.querySelectorAll('[data-testid="stat-card"]');
    expect(statCards.length).toBe(4);
  });

  // Test 4: renders category breakdown rows
  it('should render one row per category in category_breakdown', () => {
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    expect(rows.length).toBe(2);
  });

  // Test 5: shows category name in breakdown row
  it('should show category names in the breakdown section', () => {
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Groceries');
    expect(text).toContain('Transport');
  });

  // Test 6: shows zero-budget CTA card when total_budget is 0
  it('should show a zero-budget CTA linking to /settings when total_budget is 0', async () => {
    await createComponent(zeroStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const cta = fixture.nativeElement.querySelector('[data-testid="zero-budget-cta"]');
    expect(cta).not.toBeNull();
  });

  // Test 7: shows empty-state card when category_breakdown is empty but budget is set
  it('should show an empty-state card linking to /transactions when category_breakdown is empty', async () => {
    const noTransactionStats: DashboardStats = {
      ...zeroStats,
      total_budget: 3000,
      remaining_budget: 3000,
    };
    await createComponent(noTransactionStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('[data-testid="category-empty-state"]');
    expect(emptyState).not.toBeNull();
  });

  // Test 9: shows budget limit via appCurrency when budget is non-null
  it('should display budget limit using appCurrency pipe when budget is non-null', () => {
    fixture.detectChanges();
    // Groceries row has budget: 1000, should show £1,000.00
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    const groceriesRow: HTMLElement = rows[0];
    expect(groceriesRow.textContent).toContain('£1,000.00');
  });

  // Test 10: shows "No limit" when budget is null
  it('should display "No limit" when category budget is null', () => {
    fixture.detectChanges();
    // Transport row has budget: null
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    const transportRow: HTMLElement = rows[1];
    expect(transportRow.textContent).toContain('No limit');
  });

  // Test 11: progress bar width reflects spent/budget ratio
  it('should set progress bar fill width to (spent/budget)*100% when budget is non-null', () => {
    fixture.detectChanges();
    // Groceries: spent=800, budget=1000 → 80%
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    const fill = rows[0].querySelector('[data-testid="category-progress-fill"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('80%');
  });

  // Test 12: progress bar capped at 100%
  it('should cap progress bar fill at 100% when spent exceeds budget', async () => {
    const overspentCategoryStats: DashboardStats = {
      total_budget: 5000,
      total_spent: 1500,
      remaining_budget: 3500,
      savings_rate: 0,
      category_breakdown: [{ category_name: 'Groceries', spent: 1500, budget: 1000 }],
    };
    await createComponent(overspentCategoryStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const fill = fixture.nativeElement.querySelector('[data-testid="category-progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  // Test 13: progress bar uses over-budget class when spent >= 90% of budget
  it('should NOT apply over-budget class when spent is < 90% of budget', () => {
    fixture.detectChanges();
    // Groceries: spent=800, budget=1000 → 80% — NOT at limit
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    const fillUnder = rows[0].querySelector('[data-testid="category-progress-fill"]') as HTMLElement;
    expect(fillUnder.classList.contains('over-budget')).toBeFalse();
  });

  it('should apply over-budget class when spent is exactly 90% of budget', async () => {
    const cautionStats: DashboardStats = {
      total_budget: 5000,
      total_spent: 900,
      remaining_budget: 4100,
      savings_rate: 0,
      category_breakdown: [{ category_name: 'Groceries', spent: 900, budget: 1000 }],
    };
    await createComponent(cautionStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const fill = fixture.nativeElement.querySelector('[data-testid="category-progress-fill"]') as HTMLElement;
    expect(fill.classList.contains('over-budget')).toBeTrue();
  });

  // Test 14: plain bar segment when budget is null (progress bar still shown but no percentage calc)
  it('should render a progress bar track when category budget is null', () => {
    fixture.detectChanges();
    // Transport row has budget: null
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="category-row"]');
    const transportRow: HTMLElement = rows[1];
    const track = transportRow.querySelector('[data-testid="category-progress-track"]');
    expect(track).not.toBeNull();
  });

  // Test 15: empty-state card when category_breakdown is empty (even with zero budget — no budget set)
  it('should show empty-state card linking to /transactions when category_breakdown is empty', async () => {
    await createComponent(zeroStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('[data-testid="category-empty-state"]');
    expect(emptyState).not.toBeNull();
    const link = emptyState?.querySelector('a[routerLink]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
  });

  // Test 16: renders without errors when stats has empty breakdown (household_id null scenario)
  it('should render without errors when category_breakdown is empty (household_id null / zeroed stats)', async () => {
    await createComponent(zeroStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(component).toBeTruthy();
  });

  // Test 8: remaining_budget shown as non-negative
  it('should not show negative remaining_budget (floors at 0)', async () => {
    const overspentStats: DashboardStats = {
      total_budget: 1000,
      total_spent: 1500,
      remaining_budget: 0,
      savings_rate: 0,
      category_breakdown: [{ category_name: 'Groceries', spent: 1500, budget: null }],
    };
    await createComponent(overspentStats);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const remaining = fixture.nativeElement.querySelector('[data-testid="stat-remaining"]');
    expect(remaining?.textContent).not.toContain('-');
  });
});
