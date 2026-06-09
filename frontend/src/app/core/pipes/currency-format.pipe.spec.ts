import { TestBed } from '@angular/core/testing';
import { CurrencyFormatPipe } from './currency-format.pipe';
import { SettingsService } from '../../settings/services/settings.service';
import { of } from 'rxjs';

describe('CurrencyFormatPipe', () => {
  let pipe: CurrencyFormatPipe;
  let mockSettingsService: { getSettings: jasmine.Spy };

  function setupPipe(currency: string) {
    mockSettingsService = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(
        of({ currency, display_name: null, monthly_budget: null })
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CurrencyFormatPipe,
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    });
    pipe = TestBed.inject(CurrencyFormatPipe);
  }

  // Test 1: pipe is injectable
  it('should be created', () => {
    setupPipe('GBP');
    expect(pipe).toBeTruthy();
  });

  // Test 2: returns '--' for null input
  it('should return "--" for null input', () => {
    setupPipe('GBP');
    expect(pipe.transform(null)).toBe('--');
  });

  // Test 3: returns '--' for undefined input
  it('should return "--" for undefined input', () => {
    setupPipe('GBP');
    expect(pipe.transform(undefined)).toBe('--');
  });

  // Test 4: GBP shows £ symbol
  it('should format GBP amount with £ symbol', () => {
    setupPipe('GBP');
    const result = pipe.transform(1234.56);
    expect(result).toContain('£');
    expect(result).toContain('1,234.56');
  });

  // Test 5: USD shows $ symbol
  it('should format USD amount with $ symbol', () => {
    setupPipe('USD');
    const result = pipe.transform(99.99);
    expect(result).toContain('$');
    expect(result).toContain('99.99');
  });

  // Test 6: EUR shows € symbol
  it('should format EUR amount with € symbol', () => {
    setupPipe('EUR');
    const result = pipe.transform(500);
    expect(result).toContain('€');
  });

  // Test 7: unknown currency code falls back to the code itself
  it('should fall back to currency code when unknown', () => {
    setupPipe('CHF');
    const result = pipe.transform(100);
    expect(result).toContain('CHF');
  });

  // Test 8: always shows 2 decimal places
  it('should always show 2 decimal places', () => {
    setupPipe('GBP');
    const result = pipe.transform(50);
    expect(result).toContain('50.00');
  });
});
