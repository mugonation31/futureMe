import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink, RouterModule } from '@angular/router';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { SettingsService } from '../../../settings/services/settings.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLink, CurrencyPipe, NgClass, NgIf, NgFor, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private settingsService = inject(SettingsService);

  stats: DashboardStats | null = null;
  loading = false;
  error: string | null = null;
  currency = 'GBP';

  get netPositionClass(): 'positive' | 'caution' {
    if (!this.stats) return 'positive';
    return this.stats.net_position >= 0 ? 'positive' : 'caution';
  }

  get emergencyFundPercent(): number {
    if (!this.stats?.emergency_fund_status) return 0;
    const { current_amount, target_amount } = this.stats.emergency_fund_status;
    if (!target_amount) return 0;
    return Math.min((current_amount / target_amount) * 100, 100);
  }

  ngOnInit() {
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        this.currency = settings.currency ?? 'GBP';
      },
      error: () => {
        this.currency = 'GBP';
      }
    });
    this.loadStats();
  }

  loadStats() {
    this.loading = true;
    this.error = null;

    this.dashboardService.getStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load dashboard. Please try again.';
        console.error('Dashboard load failed', err?.status);
        this.loading = false;
      }
    });
  }
}
