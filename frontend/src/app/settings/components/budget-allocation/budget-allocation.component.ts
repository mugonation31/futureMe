import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TransactionService } from '../../../transactions/services/transaction.service';
import { Category, CategoryBudget } from '../../../transactions/models/transaction.model';

export interface BudgetRow {
  category: Category;
  limit: string;
  originalLimit: string;
}

@Component({
  selector: 'app-budget-allocation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-allocation.component.html',
  styleUrl: './budget-allocation.component.scss',
})
export class BudgetAllocationComponent implements OnInit {
  private transactionService = inject(TransactionService);

  rows: BudgetRow[] = [];
  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    forkJoin({
      categories: this.transactionService.getCategories(),
      budgets: this.transactionService.getBudgets(),
    }).subscribe({
      next: ({ categories, budgets }) => {
        this.rows = categories.map(category => {
          const existing = budgets.find(b => b.category_id === category.id);
          const limitStr = existing ? String(existing.monthly_limit) : '';
          return { category, limit: limitStr, originalLimit: limitStr };
        });
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load budget data.';
        this.loading = false;
      },
    });
  }

  onSave(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const invalidRows = this.rows.filter(row => {
      if (row.limit === '') return false;
      const parsed = parseFloat(String(row.limit));
      return !isFinite(parsed) || parsed <= 0;
    });
    if (invalidRows.length > 0) {
      this.errorMessage = 'Please enter valid positive numbers for all budget limits.';
      return;
    }

    this.saving = true;
    const snapshot = this.rows.map(r => ({ ...r }));

    const calls = this.rows
      .filter(row => row.limit !== row.originalLimit)
      .map(row =>
        row.limit !== ''
          ? this.transactionService.upsertBudget(row.category.id, parseFloat(String(row.limit)))
          : this.transactionService.deleteBudget(row.category.id)
      );

    if (calls.length === 0) {
      this.saving = false;
      return;
    }

    forkJoin(calls).subscribe({
      next: () => {
        this.rows.forEach(row => { row.originalLimit = row.limit; });
        this.saving = false;
        this.successMessage = 'Budget saved successfully.';
      },
      error: (err) => {
        this.rows.forEach((row, i) => { row.limit = snapshot[i].originalLimit; });
        this.saving = false;
        if (err?.status === 403) {
          this.errorMessage = 'Only the household owner can set budgets.';
        } else {
          this.errorMessage = 'Failed to save budgets. Please try again.';
        }
      },
    });
  }
}
