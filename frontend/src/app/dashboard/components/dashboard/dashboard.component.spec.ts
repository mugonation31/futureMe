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
      { category_name: 'Groceries', spent: 800 },
      { category_name: 'Transport', spent: 400 },
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

    const emptyState = fixture.nativeElement.querySelector('[data-testid="empty-transactions"]');
    expect(emptyState).not.toBeNull();
  });

  // Test 8: remaining_budget shown as non-negative
  it('should not show negative remaining_budget (floors at 0)', async () => {
    const overspentStats: DashboardStats = {
      total_budget: 1000,
      total_spent: 1500,
      remaining_budget: 0,
      savings_rate: 0,
      category_breakdown: [{ category_name: 'Groceries', spent: 1500 }],
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
