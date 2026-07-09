/**
 * Typed interfaces mirroring the backend monthly-budget payload EXACTLY.
 *
 * The backend serialises snake_case and Angular's HttpClient performs NO case
 * transform, so every field name here is snake_case to match the wire format
 * (see backend/models.py: BudgetResponse and friends).
 */

export type BudgetScope = 'personal' | 'household';

export type BucketKey = 'fundamentals' | 'future_you' | 'fun';

/** The three editable goal percentages carried on a budget. */
export interface BudgetGoals {
  fundamentals_goal_pct: number;
  future_you_goal_pct: number;
  fun_goal_pct: number;
}

/** A single income stream under a budget. */
export interface IncomeStream {
  id: string;
  budget_id: string;
  label: string;
  amount: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** A single spending line item, nested inside one of the three buckets. */
export interface LineItem {
  id: string;
  budget_id: string;
  bucket: BucketKey;
  label: string;
  amount: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Computed, colour-flagged summary for a single bucket. */
export interface BucketDashboard {
  bucket: BucketKey;
  goal_pct: number;
  ideal_amount: number;
  /** 0–100 scale. */
  actual_pct: number;
  bucket_total: number;
  available_to_spend: number;
  is_over_flag: boolean;
}

/** A bucket's line items plus its computed dashboard. */
export interface BucketView {
  line_items: LineItem[];
  dashboard: BucketDashboard;
}

/** The three buckets in canonical order: Fundamentals, Future You, Fun. */
export interface BudgetBuckets {
  fundamentals: BucketView;
  future_you: BucketView;
  fun: BucketView;
}

/**
 * Whether the user has money left to allocate, is balanced, or over.
 * Carries only the machine-readable state + amount (NO `message` field — the
 * user-facing copy is built by the frontend from state + amount + currency).
 */
export interface AllocationStatus {
  state: 'left' | 'balanced' | 'over';
  amount: number;
}

/** The single monthly-budget payload the frontend reads. */
export interface BudgetResponse {
  id: string;
  scope: BudgetScope;
  user_id: string | null;
  household_id: string | null;
  month: string;
  currency: string;
  goals: BudgetGoals;
  total_income: number;
  income_streams: IncomeStream[];
  buckets: BudgetBuckets;
  allocation_status: AllocationStatus;
}

// ---- Request payload shapes ----

export interface IncomeStreamCreate {
  label: string;
  amount: number;
}

export interface IncomeStreamUpdate {
  label?: string;
  amount?: number;
}

export interface LineItemCreate {
  bucket: BucketKey;
  label: string;
  amount: number;
}

export interface LineItemUpdate {
  bucket?: BucketKey;
  label?: string;
  amount?: number;
}

export interface BudgetGoalsUpdate {
  fundamentals_goal_pct: number;
  future_you_goal_pct: number;
  fun_goal_pct: number;
}

/**
 * Currencies the app supports — mirrors the set handled by
 * `core/pipes/currency-format.pipe.ts` (extend both together). Used to
 * constrain currency-write callers; the backend remains the validation
 * authority and `BudgetResponse.currency` stays a plain string since the
 * wire could carry any value.
 */
export type CurrencyCode = 'GBP' | 'USD' | 'EUR';

/**
 * Body for the currency-only variant of `PATCH /api/budget/{id}` (the same
 * endpoint that backs goal updates). Kept separate from `BudgetGoalsUpdate`
 * so the all-three-goals-or-none contract stays intact.
 */
export interface BudgetCurrencyUpdate {
  currency: CurrencyCode;
}
