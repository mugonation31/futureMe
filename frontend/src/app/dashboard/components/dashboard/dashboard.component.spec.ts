import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, NEVER } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: { getStats: jasmine.Spy };

  const mockStats: DashboardStats = {
    total_clients: 5,
    total_invoices: 12,
    total_revenue: 15000,
    outstanding_amount: 3500,
    overdue_count: 2,
    paid_this_month: 5000,
    draft_count: 3,
    recent_invoices: [
      {
        id: 'inv-1',
        invoice_number: 'INV-0001',
        client_name: 'Acme Corp',
        total_due: 1200,
        status: 'paid',
        created_at: '2026-03-01T10:00:00',
      },
      {
        id: 'inv-2',
        invoice_number: 'INV-0002',
        client_name: 'Beta Inc',
        total_due: 500,
        status: 'sent',
        created_at: '2026-03-05T10:00:00',
      },
    ]
  };

  beforeEach(async () => {
    mockDashboardService = {
      getStats: jasmine.createSpy('getStats').and.returnValue(of(mockStats)),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  // Test 6: should create the component
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Test 7: should load stats on init
  it('should load stats on init', () => {
    fixture.detectChanges();

    expect(mockDashboardService.getStats).toHaveBeenCalled();
    expect(component.stats).toEqual(mockStats);
    expect(component.loading).toBeFalse();
  });

  // Test 8: should display four stat cards
  it('should display four stat cards', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const cards = compiled.querySelectorAll('.stat-card');
    expect(cards.length).toBe(4);

    // Check card content
    expect(cards[0].textContent).toContain('12');
    expect(cards[0].textContent).toContain('Total Invoices');

    expect(cards[1].textContent).toContain('Total Revenue');

    expect(cards[2].textContent).toContain('Outstanding');

    expect(cards[3].textContent).toContain('2');
    expect(cards[3].textContent).toContain('Overdue');
  });

  // Test 9: should display recent invoices
  it('should display recent invoices', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const recentSection = compiled.querySelector('.recent-invoices');
    expect(recentSection).toBeTruthy();

    const rows = compiled.querySelectorAll('.table-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('INV-0001');
    expect(rows[0].textContent).toContain('Acme Corp');
    expect(rows[1].textContent).toContain('INV-0002');
    expect(rows[1].textContent).toContain('Beta Inc');

    // Check View All link exists
    const viewAllLink = compiled.querySelector('.view-all-link');
    expect(viewAllLink).toBeTruthy();
    expect(viewAllLink?.textContent).toContain('View All');
  });

  // Test 10: should have quick action links
  it('should have quick action links', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const quickActions = compiled.querySelector('.quick-actions');
    expect(quickActions).toBeTruthy();

    const actionBtns = compiled.querySelectorAll('.action-btn');
    expect(actionBtns.length).toBe(3);
    expect(actionBtns[0].textContent).toContain('New Invoice');
    expect(actionBtns[1].textContent).toContain('Add Client');
    expect(actionBtns[2].textContent).toContain('Settings');
  });
});
