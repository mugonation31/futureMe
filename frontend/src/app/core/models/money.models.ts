export interface Account {
  id: string;
  household_id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash';
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface AccountCreate {
  name: string;
  type: 'checking' | 'savings' | 'cash';
  balance?: number;
  currency?: string;
}

export interface IncomeEntry {
  id: string;
  household_id: string;
  user_id: string;
  source: string;
  amount: number;
  frequency: 'monthly' | 'weekly' | 'annual';
  created_at: string;
  updated_at: string;
}

export interface IncomeCreate {
  source: string;
  amount: number;
  frequency: 'monthly' | 'weekly' | 'annual';
}

export interface Expense {
  id: string;
  household_id: string;
  user_id: string;
  category?: string;
  description?: string;
  amount: number;
  date: string;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreate {
  amount: number;
  category?: string;
  description?: string;
  date?: string;
  is_recurring?: boolean;
}

export interface Debt {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  target_payoff_date?: string;
  created_at: string;
  updated_at: string;
}

export interface DebtCreate {
  name: string;
  balance: number;
  interest_rate?: number;
  minimum_payment?: number;
  target_payoff_date?: string;
}

export interface SavingsGoal {
  id: string;
  household_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoalCreate {
  name: string;
  target_amount: number;
  current_amount?: number;
  deadline?: string;
}

export interface EmergencyFundStatus {
  current_amount: number;
  target_amount: number;
  months_covered: number | null;
}

export interface DebtSummary {
  total_owed: number;
  total_minimum_payments: number;
  debt_count: number;
}

export interface SavingsProgress {
  goal_name: string;
  target_amount: number;
  current_amount: number;
  percent: number;
}

export interface DashboardStats {
  total_income: number;
  total_expenses: number;
  net_position: number;
  emergency_fund_status: EmergencyFundStatus;
  debt_summary: DebtSummary;
  savings_progress: SavingsProgress[];
}
