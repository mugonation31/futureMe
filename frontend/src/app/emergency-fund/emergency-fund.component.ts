import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, NgIf } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { MoneyService } from '../core/services/money.service';
import { SavingsGoal, Expense } from '../core/models/money.models';

@Component({
  selector: 'app-emergency-fund',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, NgIf],
  templateUrl: './emergency-fund.component.html',
  styleUrl: './emergency-fund.component.scss',
})
export class EmergencyFundComponent implements OnInit {
  private moneyService = inject(MoneyService);

  goal: SavingsGoal | null = null;
  expenses: Expense[] = [];
  loading = true;

  useManualTarget = false;
  currentAmountControl = new FormControl<number>(0, { nonNullable: true });
  manualTargetControl = new FormControl<number>(0, { nonNullable: true });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    let goalsLoaded = false;
    let expensesLoaded = false;

    const checkDone = () => {
      if (goalsLoaded && expensesLoaded) {
        this.loading = false;
      }
    };

    this.moneyService.getSavingsGoals().subscribe({
      next: (goals) => {
        const found = goals.find(
          (g) => g.name.toLowerCase() === 'emergency fund'
        ) ?? null;
        this.goal = found;
        if (found) {
          this.currentAmountControl.setValue(found.current_amount);
          this.manualTargetControl.setValue(found.target_amount);
        }
        goalsLoaded = true;
        checkDone();
      },
      error: () => {
        goalsLoaded = true;
        checkDone();
      },
    });

    this.moneyService.getExpenses().subscribe({
      next: (expenses) => {
        this.expenses = expenses;
        expensesLoaded = true;
        checkDone();
      },
      error: () => {
        expensesLoaded = true;
        checkDone();
      },
    });
  }

  get monthlyExpenses(): number {
    return this.expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  get autoTarget(): number {
    return this.monthlyExpenses * 3;
  }

  get effectiveTarget(): number {
    return this.useManualTarget ? (this.manualTargetControl.value || 0) : this.autoTarget;
  }

  get currentAmount(): number {
    return this.goal ? this.goal.current_amount : (this.currentAmountControl.value || 0);
  }

  get progressPercent(): number {
    const target = this.effectiveTarget;
    if (target <= 0) return 0;
    return Math.min(100, (this.currentAmount / target) * 100);
  }

  get monthsCovered(): number {
    if (this.monthlyExpenses <= 0) return 0;
    return this.currentAmount / this.monthlyExpenses;
  }

  save(): void {
    const current = this.currentAmountControl.value ?? 0;
    const target = this.effectiveTarget;

    if (this.goal) {
      this.moneyService.updateSavingsGoal(this.goal.id, {
        current_amount: current,
        target_amount: target,
      }).subscribe({
        next: (updated) => {
          this.goal = updated;
        },
      });
    } else {
      this.moneyService.createSavingsGoal({
        name: 'Emergency Fund',
        target_amount: target,
        current_amount: current,
      }).subscribe({
        next: (created) => {
          this.goal = created;
        },
      });
    }
  }
}
