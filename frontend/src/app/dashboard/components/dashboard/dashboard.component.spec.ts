import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: { getStats: jasmine.Spy };

  const mockStats: DashboardStats = {
    total_budget: 5000,
    total_spent: 1200,
    remaining_budget: 3800,
    savings_rate: 0.24
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
