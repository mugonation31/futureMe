import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, NgIf, NgFor, NgClass } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense } from '../core/models/money.models';

@Component({
  selector: 'app-monthly-review',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, NgIf, NgFor, NgClass],
  templateUrl: './monthly-review.component.html',
  styleUrl: './monthly-review.component.scss',
})
export class MonthlyReviewComponent implements OnInit {
  private moneyService = inject(MoneyService);

  selectedMonth: string;
  expenses: Expense[] = [];
  income: IncomeEntry[] = [];
  loading = true;

  constructor() {
    const now = new Date();
    this.selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  get filteredExpenses(): Expense[] {
    return this.expenses.filter(e => e.date.startsWith(this.selectedMonth));
  }

  get totalIncome(): number {
    return this.income.reduce((sum, item) => sum + this.toMonthly(item), 0);
  }

  private toMonthly(item: IncomeEntry): number {
    if (item.frequency === 'weekly') return (item.amount * 52) / 12;
    if (item.frequency === 'annual') return item.amount / 12;
    return item.amount;
  }

  get totalExpenses(): number {
    return this.expenses
      .filter(e => e.date.startsWith(this.selectedMonth))
      .reduce((sum, e) => sum + e.amount, 0);
  }

  get netSavings(): number {
    return this.totalIncome - this.totalExpenses;
  }

  get isOnTrack(): boolean {
    return this.netSavings >= 0;
  }

  ngOnInit(): void {
    forkJoin({
      income: this.moneyService.getIncome(),
      expenses: this.moneyService.getExpenses(),
    }).subscribe({
      next: ({ income, expenses }) => {
        this.income = income;
        this.expenses = expenses;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  onMonthChange(month: string): void {
    this.selectedMonth = month;
    this.loading = true;
    this.moneyService.getExpenses().subscribe({
      next: (expenses) => { this.expenses = expenses; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
}
