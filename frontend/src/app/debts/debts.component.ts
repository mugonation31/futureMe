import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, NgFor, NgIf, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MoneyService } from '../core/services/money.service';
import { Debt, DebtCreate } from '../core/models/money.models';

@Component({
  selector: 'app-debts',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, NgFor, NgIf, DatePipe],
  templateUrl: './debts.component.html',
  styleUrl: './debts.component.scss',
})
export class DebtsComponent implements OnInit {
  private moneyService = inject(MoneyService);
  private fb = inject(FormBuilder);

  debts: Debt[] = [];
  loading = true;
  showAddForm = false;

  debtForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    balance: [null, [Validators.required, Validators.min(0)]],
    interest_rate: [null, [Validators.required, Validators.min(0)]],
    minimum_payment: [null, [Validators.required, Validators.min(0)]],
    target_payoff_date: [''],
  });

  get totalOwed(): number {
    return this.debts.reduce((sum, d) => sum + d.balance, 0);
  }

  get totalMinimumPayments(): number {
    return this.debts.reduce((sum, d) => sum + d.minimum_payment, 0);
  }

  ngOnInit(): void {
    this.loadDebts();
  }

  loadDebts(): void {
    this.loading = true;
    this.moneyService.getDebts().subscribe({
      next: (debts) => {
        this.debts = debts;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  addDebt(): void {
    if (this.debtForm.invalid) return;
    const raw = this.debtForm.value;
    const payload: DebtCreate = {
      name: raw.name,
      balance: raw.balance,
      interest_rate: raw.interest_rate,
      minimum_payment: raw.minimum_payment,
      target_payoff_date: raw.target_payoff_date || undefined,
    };
    this.moneyService.createDebt(payload).subscribe({
      next: () => {
        this.showAddForm = false;
        this.debtForm.reset();
        this.loadDebts();
      },
    });
  }

  deleteDebt(id: string): void {
    this.moneyService.deleteDebt(id).subscribe({
      next: () => {
        this.loadDebts();
      },
    });
  }
}
