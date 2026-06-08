export interface Category {
  id: string;
  household_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
}

export interface Transaction {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  type: 'expense' | 'income';
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionCreate {
  amount: number;
  type: 'expense' | 'income';
  description?: string | null;
  date?: string | null;
  category_id?: string | null;
}
