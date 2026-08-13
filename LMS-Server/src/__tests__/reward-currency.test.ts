import { describe, it, expect } from 'vitest';
import {
  parseStroops, calculateMaxExposure, decimalXlmToStroops,
  validateCurrency, MAX_SAFE_STROOPS,
} from '../services/rewards/currencyConfig.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

describe('Currency and BigInt Boundaries', () => {
  it('R-CURR-1: 1.50 XLM → 15,000,000 stroops exactly', () => {
    expect(decimalXlmToStroops('1.50')).toBe(15_000_000n);
    expect(decimalXlmToStroops('1.5')).toBe(15_000_000n);
    expect(decimalXlmToStroops('0.0000001')).toBe(1n);
  });

  it('R-CURR-2: precision beyond 7 decimals rejected', () => {
    expect(() => decimalXlmToStroops('1.00000001')).toThrow(RewardError);
  });

  it('R-CURR-3: ZAR rejected', () => {
    expect(() => validateCurrency('ZAR')).toThrow(RewardError);
  });

  it('R-CURR-4: USD rejected', () => {
    expect(() => validateCurrency('USD')).toThrow(RewardError);
  });

  it('R-CURR-5: amount exceeding MAX_SAFE_STROOPS rejected', () => {
    const tooLarge = (MAX_SAFE_STROOPS + 1n).toString();
    expect(() => parseStroops(tooLarge)).toThrow(RewardError);
  });

  it('R-CURR-6: BigInt exposure calculation correct', () => {
    // 100_000_000 * 10_000 = 1_000_000_000_000 (within MAX_SAFE)
    const result = calculateMaxExposure('100000000', '10000');
    expect(result).toBe(1_000_000_000_000n);
    // Exceeding MAX_SAFE should throw
    expect(() => calculateMaxExposure('9007199254740991', '2')).toThrow(RewardError);
  });

  it('R-CURR-7: negative amounts rejected', () => {
    expect(() => parseStroops('-100')).toThrow(RewardError);
  });

  it('R-CURR-8: zero amounts rejected', () => {
    expect(() => parseStroops('0')).toThrow(RewardError);
  });

  it('R-CURR-9: string parsing works correctly', () => {
    expect(parseStroops('10000000')).toBe(10_000_000n);
    expect(parseStroops('1')).toBe(1n);
    expect(parseStroops('9007199254740991')).toBe(MAX_SAFE_STROOPS);
  });

  it('R-CURR-10: floating-point input rejected', () => {
    expect(() => parseStroops('100.5')).toThrow(RewardError);
    expect(() => parseStroops('1e7')).toThrow(RewardError);
  });
});
