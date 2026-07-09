import { Component } from '@angular/core';

/**
 * BudgetComponent — the home of the Intentional Spending Tracker.
 *
 * This is a minimal placeholder introduced in Task 27 to resolve the
 * /budget route chicken-and-egg after the money-era screens were retired.
 * Task 28 will flesh out the real budget UI (the computed header, the
 * 50/30/20 allocations, and the income/expense flows).
 */
@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [],
  templateUrl: './budget.component.html',
  styleUrl: './budget.component.scss'
})
export class BudgetComponent {}
