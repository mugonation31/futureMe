import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense, Debt, SavingsGoal } from '../core/models/money.models';

export interface Suggestion {
  title: string;
  description: string;
  amount: number;
  routerLink: string;
}

@Component({
  selector: 'app-opportunities',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, NgFor, NgIf, RouterLink],
  templateUrl: './opportunities.component.html',
  styleUrl: './opportunities.component.scss',
})
export class OpportunitiesComponent implements OnInit {
  private moneyService = inject(MoneyService);

  income: IncomeEntry[] = [];
  expenses: Expense[] = [];
  debts: Debt[] = [];
  savingsGoals: SavingsGoal[] = [];
  loading = true;

  get totalMonthlyIncome(): number {
    return this.income.reduce((sum, entry) => {
      if (entry.frequency === 'monthly') return sum + entry.amount;
      if (entry.frequency === 'weekly') return sum + entry.amount * 52 / 12;
      if (entry.frequency === 'annual') return sum + entry.amount / 12;
      return sum;
    }, 0);
  }

  get totalMonthlyExpenses(): number {
    return this.expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  get surplus(): number {
    return this.totalMonthlyIncome - this.totalMonthlyExpenses;
  }

  get emergencyFundGoal(): SavingsGoal | undefined {
    return this.savingsGoals.find(g => g.name === 'Emergency Fund');
  }

  get emergencyFundFull(): boolean {
    const ef = this.emergencyFundGoal;
    if (!ef) return true;
    return ef.current_amount >= ef.target_amount;
  }

  get suggestions(): Suggestion[] {
    if (this.surplus <= 0) return [];

    const result: Suggestion[] = [];
    let remaining = this.surplus;

    // 1. Top up emergency fund if below target
    if (!this.emergencyFundFull && this.emergencyFundGoal) {
      const ef = this.emergencyFundGoal;
      const needed = ef.target_amount - ef.current_amount;
      const contribution = Math.min(remaining, needed);
      result.push({
        title: 'Top up Emergency Fund',
        description: `Put £${Math.round(contribution).toLocaleString()} towards your Emergency Fund (£${Math.round(ef.current_amount).toLocaleString()} of £${Math.round(ef.target_amount).toLocaleString()} saved).`,
        amount: Math.round(contribution),
        routerLink: '/emergency-fund',
      });
    }

    // 2. Extra debt payment — highest interest rate first
    if (this.debts.length > 0) {
      const highestDebt = [...this.debts].sort((a, b) => b.interest_rate - a.interest_rate)[0];
      result.push({
        title: `Extra payment on ${highestDebt.name}`,
        description: `Pay extra on your highest-interest debt (${highestDebt.interest_rate}% APR) to reduce interest faster.`,
        amount: Math.round(remaining),
        routerLink: '/debts',
      });
    }

    // 3. Boost savings goal — closest to target first (exclude Emergency Fund)
    const otherGoals = this.savingsGoals
      .filter(g => g.name !== 'Emergency Fund' && g.current_amount < g.target_amount)
      .sort((a, b) => (a.target_amount - a.current_amount) - (b.target_amount - b.current_amount));

    if (otherGoals.length > 0) {
      const closest = otherGoals[0];
      const needed = closest.target_amount - closest.current_amount;
      const contribution = Math.min(remaining, needed);
      result.push({
        title: `Boost "${closest.name}" savings`,
        description: `You're £${Math.round(needed).toLocaleString()} away from your goal. Add £${Math.round(contribution).toLocaleString()} this month.`,
        amount: Math.round(contribution),
        routerLink: '/money-plan',
      });
    }

    return result;
  }

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    let pending = 4;
    const done = () => { pending--; if (pending === 0) this.loading = false; };

    this.moneyService.getIncome().subscribe({ next: v => { this.income = v; done(); }, error: done });
    this.moneyService.getExpenses().subscribe({ next: v => { this.expenses = v; done(); }, error: done });
    this.moneyService.getDebts().subscribe({ next: v => { this.debts = v; done(); }, error: done });
    this.moneyService.getSavingsGoals().subscribe({ next: v => { this.savingsGoals = v; done(); }, error: done });
  }
}
