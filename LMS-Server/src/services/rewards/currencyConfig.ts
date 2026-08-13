import { RewardError } from './rewardErrors.js';

export const SUPPORTED_CURRENCIES = ['XLM'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_SCALES: Record<CurrencyCode, bigint> = {
  XLM: 10_000_000n,
};

export const MAX_SAFE_STROOPS = 9_007_199_254_740_991n;
export const MAX_INDIVIDUAL_AMOUNT_STROOPS = 1_000_000_000_000n; // 100,000 XLM
export const MAX_RECIPIENTS = 10_000;
export const HIGH_VALUE_THRESHOLD_STROOPS = 1_000_000_000n; // 100 XLM

export function parseStroops(input: string): bigint {
  if (input.includes('.') || input.includes('e') || input.includes('E')) {
    throw new RewardError('INVALID_AMOUNT', 'Amount must be a whole number string (integer stroops)');
  }
  let n: bigint;
  try {
    n = BigInt(input);
  } catch {
    throw new RewardError('INVALID_AMOUNT', `Invalid stroop value: ${input}`);
  }
  if (n <= 0n) throw new RewardError('INVALID_AMOUNT', 'Amount must be positive');
  if (n > MAX_SAFE_STROOPS) throw new RewardError('AMOUNT_EXCEEDS_MAXIMUM', `Amount exceeds maximum of ${MAX_SAFE_STROOPS}`);
  return n;
}

export function calculateMaxExposure(amountStroops: string | bigint, maxRecipients: string | bigint): bigint {
  const amount = typeof amountStroops === 'string' ? BigInt(amountStroops) : amountStroops;
  const recipients = typeof maxRecipients === 'string' ? BigInt(maxRecipients) : maxRecipients;
  const exposure = amount * recipients;
  if (exposure > MAX_SAFE_STROOPS) {
    throw new RewardError('EXPOSURE_EXCEEDS_MAXIMUM', `Total exposure ${exposure} exceeds maximum`);
  }
  return exposure;
}

export function decimalXlmToStroops(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  if (frac.length > 7) {
    throw new RewardError('INVALID_PRECISION', 'XLM supports at most 7 decimal places');
  }
  const paddedFrac = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(paddedFrac);
}

export function validateCurrency(code: string): asserts code is CurrencyCode {
  if (!SUPPORTED_CURRENCIES.includes(code as CurrencyCode)) {
    throw new RewardError('UNSUPPORTED_CURRENCY', `Currency ${code} is not supported`);
  }
}
