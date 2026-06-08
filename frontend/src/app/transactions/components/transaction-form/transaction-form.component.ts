import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TransactionService } from '../../services/transaction.service';
import { Category } from '../../models/transaction.model';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './transaction-form.component.html',
  styleUrls: ['./transaction-form.component.scss'],
})
export class TransactionFormComponent implements OnInit {
  @Output() saved = new EventEmitter<void>();

  form: FormGroup;
  categories: Category[] = [];
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private transactionService: TransactionService,
  ) {
    this.form = this.fb.group({
      amount: [null, [Validators.required, Validators.min(0.01)]],
      type: ['expense', Validators.required],
      description: [''],
      date: [this.today(), Validators.required],
      category_id: [null],
    });
  }

  ngOnInit(): void {
    this.transactionService.getCategories().subscribe(cats => {
      this.categories = cats;
    });
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const value = this.form.value;
    this.transactionService.createTransaction({
      amount: value.amount,
      type: value.type,
      description: value.description || null,
      date: value.date,
      category_id: value.category_id || null,
    }).subscribe({
      next: () => this.saved.emit(),
      error: () => { this.errorMessage = 'Failed to save transaction.'; },
    });
  }
}
