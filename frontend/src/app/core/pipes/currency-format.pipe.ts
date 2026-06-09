import { DestroyRef, Pipe, PipeTransform, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SettingsService } from '../../settings/services/settings.service';

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
};

const CURRENCY_LOCALES: Record<string, string> = {
  GBP: 'en-GB',
  USD: 'en-US',
  EUR: 'de-DE',
};

@Pipe({
  name: 'appCurrency',
  standalone: true,
})
export class CurrencyFormatPipe implements PipeTransform {
  private settingsService = inject(SettingsService);
  private destroyRef = inject(DestroyRef);
  private currency = 'GBP';

  constructor() {
    this.settingsService.getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => { if (s?.currency) this.currency = s.currency; },
        error: () => { /* use default GBP */ },
      });
  }

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '--';

    const currency = this.currency;
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const locale = CURRENCY_LOCALES[currency] ?? 'en-GB';

    return symbol + value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
