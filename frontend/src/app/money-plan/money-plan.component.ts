import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, NgIf, NgFor } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MoneyService } from '../core/services/money.service';
import { IncomeEntry, Expense } from '../core/models/money.models';

@Component({
  selector: 'app-money-plan',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, NgIf, NgFor],
  templateUrl: './money-plan.component.html',
  styleUrl: './money-plan.component.scss',
})
export class MoneyPlanComponent implements OnInit {
  private moneyService = inject(MoneyService);
  private fb = inject(FormBuilder);

  income: IncomeEntry[] = [];
  expenses: Expense[] = [];
  loading = true;

  showAddIncome = false;
  showAddExpense = false;

  incomeForm: FormGroup = this.fb.group({
    source: ['', Validators.required],
    amount: [null, [Validators.required, Validators.min(0.01)]],
    frequency: ['monthly', Validators.required],
  });

  expenseForm: FormGroup = this.fb.group({
    category: ['', Validators.required],
    description: [''],
    amount: [null, [Validators.required, Validators.min(0.01)]],
  });

  get totalMonthlyIncome(): number {
    return this.income.reduce((sum, item) => {
      let monthly: number;
      if (item.frequency === 'weekly') {
        monthly = (item.amount * 52) / 12;
      } else if (item.frequency === 'annual') {
        monthly = item.amount / 12;
      } else {
        monthly = item.amount;
      }
      return sum + monthly;
    }, 0);
  }

  get totalMonthlyExpenses(): number {
    return this.expenses.reduce((sum, item) => sum + item.amount, 0);
  }

  get surplus(): number {
    return this.totalMonthlyIncome - this.totalMonthlyExpenses;
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
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

  addIncome(): void {
    if (this.incomeForm.invalid) return;
    const value = this.incomeForm.value;
    this.moneyService.createIncome({
      source: value.source,
      amount: value.amount,
      frequency: value.frequency,
    }).subscribe({
      next: (created) => {
        this.income = [...this.income, created];
        this.incomeForm.reset({ frequency: 'monthly' });
        this.showAddIncome = false;
      },
    });
  }

  deleteIncome(id: string): void {
    this.moneyService.deleteIncome(id).subscribe({
      next: () => {
        this.income = this.income.filter((i) => i.id !== id);
      },
    });
  }

  addExpense(): void {
    if (this.expenseForm.invalid) return;
    const value = this.expenseForm.value;
    this.moneyService.createExpense({
      category: value.category,
      description: value.description,
      amount: value.amount,
      date: new Date().toISOString().split('T')[0],
    }).subscribe({
      next: (created) => {
        this.expenses = [...this.expenses, created];
        this.expenseForm.reset();
        this.showAddExpense = false;
      },
    });
  }

  deleteExpense(id: string): void {
    this.moneyService.deleteExpense(id).subscribe({
      next: () => {
        this.expenses = this.expenses.filter((e) => e.id !== id);
      },
    });
  }
}
