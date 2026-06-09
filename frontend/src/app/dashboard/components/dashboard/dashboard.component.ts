import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { CurrencyFormatPipe } from '../../../core/pipes/currency-format.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink, CurrencyFormatPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);

  stats: DashboardStats | null = null;
  loading = false;
  error: string | null = null;

  ngOnInit() {
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

  get remaining(): number {
    if (!this.stats) return 0;
    return Math.max(0, this.stats.remaining_budget);
  }

  getBarWidth(spent: number): number {
    if (!this.stats || this.stats.total_budget === 0) return 0;
    return Math.min(100, (spent / this.stats.total_budget) * 100);
  }

}
