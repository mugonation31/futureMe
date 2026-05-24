export interface UserSettings {
  id?: string;
  user_id?: string;
  display_name?: string;
  currency?: string;
  monthly_budget?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CompanySettings {
  id?: string;
  user_id?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  bank_account_name?: string;
  bank_name?: string;
  account_number?: string;
  sort_code?: string;
  iban?: string;
  created_at?: string;
  updated_at?: string;
}
