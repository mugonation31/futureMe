import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { BucketKey, BucketView } from '../../core/models/budget.models';
import { formatMoney, parseAmount } from '../money';

/** Payload for adding a line item within this bucket. */
export interface LineItemDraft {
  label: string;
  amount: number;
}

/** Payload for saving an inline edit of an existing line item. */
export interface LineItemEdit extends LineItemDraft {
  id: string;
}

/**
 * BucketSectionComponent — one of the three spending buckets
 * (Fundamentals / Future You / Fun) on the budget screen.
 *
 * Purely presentational: receives its `BucketView` slice and emits CRUD
 * intents upward; the parent BudgetComponent owns all service calls.
 */
@Component({
  selector: 'app-bucket-section',
  standalone: true,
  imports: [],
  templateUrl: './bucket-section.component.html',
  styleUrl: './bucket-section.component.scss',
})
export class BucketSectionComponent {
  @Input({ required: true }) bucketKey!: BucketKey;
  @Input({ required: true }) view!: BucketView;
  @Input({ required: true }) heading!: string;
  @Input({ required: true }) subtitle!: string;
  @Input({ required: true }) symbol!: string;
  /** Item ids with an update/delete in flight (row buttons disabled). */
  @Input() pendingItemIds: ReadonlySet<string> = new Set<string>();
  /** True while this bucket's add form is submitting. */
  @Input() addPending = false;
  /** Draft goal % for this bucket (spreadsheet-style editable cell). */
  @Input({ required: true }) goalPct!: number;
  /**
   * The line item currently in inline edit mode, if any. Owned by the parent
   * (mirroring `editingIncomeId`) so edit mode only exits on CONFIRMED save
   * success — a failed mutation keeps the user's typed values on screen.
   */
  @Input() editingItemId: string | null = null;

  @Output() goalPctChange = new EventEmitter<number>();
  @Output() addItem = new EventEmitter<LineItemDraft>();
  @Output() updateItem = new EventEmitter<LineItemEdit>();
  @Output() deleteItem = new EventEmitter<string>();
  @Output() editStart = new EventEmitter<string>();
  @Output() editCancel = new EventEmitter<void>();

  @ViewChild('addLabel') private addLabelRef?: ElementRef<HTMLInputElement>;
  @ViewChild('addAmount') private addAmountRef?: ElementRef<HTMLInputElement>;

  money(value: number): string {
    return formatMoney(this.symbol, value);
  }

  onGoalInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;

    // A cleared cell is someone mid-retype — don't emit 0 (the unchanged
    // draft also means Angular won't hostilely write "0" back into the cell).
    if (raw.trim() === '') return;

    const value = Number(raw);
    if (Number.isNaN(value)) return;

    // Clamp to the valid 0–100 range and reflect the clamp in the cell.
    const clamped = Math.min(100, Math.max(0, value));
    if (clamped !== value) {
      input.value = String(clamped);
    }
    this.goalPctChange.emit(clamped);
  }

  submitAdd(event: Event, labelInput: HTMLInputElement, amountInput: HTMLInputElement): void {
    event.preventDefault();
    if (this.addPending) return;

    const label = labelInput.value.trim();
    const amount = parseAmount(amountInput.value);
    if (!label || amount === null) return;

    // The inputs are NOT cleared here: the parent calls `resetAddForm()`
    // once the create is confirmed, so a failure never loses typed values.
    this.addItem.emit({ label, amount });
  }

  /** Called by the parent after a CONFIRMED successful create. */
  resetAddForm(): void {
    if (this.addLabelRef) this.addLabelRef.nativeElement.value = '';
    if (this.addAmountRef) this.addAmountRef.nativeElement.value = '';
  }

  submitEdit(itemId: string, labelInput: HTMLInputElement, amountInput: HTMLInputElement): void {
    if (this.pendingItemIds.has(itemId)) return;

    const label = labelInput.value.trim();
    const amount = parseAmount(amountInput.value);
    if (!label || amount === null) return;

    // Edit mode is NOT exited here — the parent clears `editingItemId`
    // only when the update is confirmed.
    this.updateItem.emit({ id: itemId, label, amount });
  }
}
