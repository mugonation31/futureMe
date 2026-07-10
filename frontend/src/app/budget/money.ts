/**
 * Money helpers for the budget screen.
 *
 * The budget screen formats ALL money from the BUDGET's own currency
 * (`BudgetResponse.currency`), not the settings-driven appCurrency pipe. The
 * stored value may be a raw symbol (DB default '$') or an ISO-ish code, so we
 * normalise known codes to symbols and pass anything else through as-is.
 *
 * The symbol map mirrors `core/pipes/currency-format.pipe.ts` — extend both
 * together when adding currencies.
 */

import { CurrencyCode } from '../core/models/budget.models';

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
};

/** The selectable currencies, mirroring the CurrencyCode union. */
export const CURRENCY_CODES: readonly CurrencyCode[] = ['GBP', 'USD', 'EUR'];

/** Map a stored currency (code or raw symbol) to a display symbol. */
export function symbolFor(currency: string): string {
  return (CURRENCY_SYMBOLS as Record<string, string>)[currency] ?? currency;
}

/**
 * Map a stored currency (code or raw symbol) back to a selectable code, so
 * the currency selector can show e.g. USD selected when the DB holds '$'.
 * Unknown values return null (selector shows an empty placeholder).
 */
export function codeFor(currency: string): CurrencyCode | null {
  if ((CURRENCY_CODES as string[]).includes(currency)) {
    return currency as CurrencyCode;
  }
  const bySymbol = CURRENCY_CODES.find((code) => CURRENCY_SYMBOLS[code] === currency);
  return bySymbol ?? null;
}

/** Format an amount as `<symbol><grouped 2dp number>`, e.g. `£1,200.00`. */
export function formatMoney(symbol: string, value: number): string {
  return symbol + value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse a non-negative amount from an input's raw string, else null.
 * Negative submissions are blocked client-side (the backend also rejects).
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
