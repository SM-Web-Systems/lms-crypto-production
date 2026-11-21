/** Whole stroops to an exact XLM string: 15000000 → "1.5", 1 → "0.0000001". */
export function stroopsToXlm(stroops: number | string): string {
  const s = BigInt(typeof stroops === 'number' ? Math.trunc(stroops) : stroops);
  const fraction = (s % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${s / 10_000_000n}${fraction ? `.${fraction}` : ''}`;
}

/**
 * "0.2 XLM (≈ 0.06 USDC)" when a price exists, otherwise "0.2 XLM". The amount keeps full precision;
 * only the USDC hint is rounded. Same rules as the web formatter.
 */
export function formatXlm(stroops: number | string, xlmUsdc?: number | null, currency = 'XLM'): string {
  const amount = `${stroopsToXlm(stroops)} ${currency}`;
  if (currency !== 'XLM' || !xlmUsdc) return amount;
  const usdc = (Number(stroops) / 10_000_000) * xlmUsdc;
  return `${amount} (${usdc > 0 && usdc < 0.01 ? '< 0.01' : `≈ ${usdc.toFixed(2)}`} USDC)`;
}
