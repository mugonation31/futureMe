import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransactionService } from '../../services/transaction.service';
import { Transaction } from '../../models/transaction.model';
import { TransactionFormComponent } from '../transaction-form/transaction-form.component';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, TransactionFormComponent],
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.scss'],
})
export class TransactionListComponent implements OnInit {
  transactions: Transaction[] = [];
  showForm = false;
  errorMessage = '';

  private currentMonth: string = this.todayMonth();

  constructor(private transactionService: TransactionService) {}

  ngOnInit(): void {
    this.load();
  }

  private todayMonth(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${mm}`;
  }

  load(): void {
    this.transactionService.getTransactions(this.currentMonth).subscribe({
      next: txns => { this.transactions = txns; this.errorMessage = ''; },
      error: () => { this.errorMessage = 'Failed to load transactions.'; }
    });
  }

  onMonthChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentMonth = select.value;
    this.load();
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
  }

  onSaved(): void {
    this.showForm = false;
    this.load();
  }

  deleteTransaction(id: string): void {
    if (!confirm('Delete this transaction?')) return;
    this.transactionService.deleteTransaction(id).subscribe({
      next: () => { this.transactions = this.transactions.filter(t => t.id !== id); this.errorMessage = ''; },
      error: () => { this.errorMessage = 'Failed to delete transaction.'; }
    });
  }

  months(): string[] {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      result.push(`${d.getFullYear()}-${mm}`);
    }
    return result;
  }
}
