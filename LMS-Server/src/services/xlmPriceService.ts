/**
 * XLM → USDC reference price, for showing "0.2 XLM (≈ 0.06 USDC)" to people.
 *
 * Source: the Stellar DEX order book for native XLM against Circle USDC, read from public Horizon.
 * The public network is used even when the server runs on testnet, because testnet has no
 * Circle USDC and its DEX prices mean nothing. The value is display-only: never use it to move money.
 */

/** Circle's USDC issuer on the Stellar public network. */
export const CIRCLE_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const PUBLIC_HORIZON = 'https://horizon.stellar.org';
const TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 60_000;
const TIMEOUT_MS = 5_000;

let cache: { value: Promise<number | null>; expiresAt: number } | null = null;

export function resetXlmUsdcPriceCache(): void {
  cache = null;
}

async function fetchMidPrice(): Promise<number | null> {
  const params = new URLSearchParams({
    selling_asset_type: 'native',
    buying_asset_type: 'credit_alphanum4',
    buying_asset_code: 'USDC',
    buying_asset_issuer: CIRCLE_USDC_ISSUER,
    limit: '1',
  });
  try {
    const res = await fetch(`${PUBLIC_HORIZON}/order_book?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    // Horizon gives both sides as USDC per XLM (counter per base).
    const book = await res.json() as { bids?: { price: string }[]; asks?: { price: string }[] };
    const bid = Number(book.bids?.[0]?.price);
    const ask = Number(book.asks?.[0]?.price);
    if (!(bid > 0) || !(ask > 0) || !Number.isFinite(bid) || !Number.isFinite(ask)) return null;
    return (bid + ask) / 2;
  } catch {
    return null;
  }
}

/** USDC per 1 XLM, or null when no price is available. Cached for about 5 minutes. */
export function getXlmUsdcPrice(): Promise<number | null> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;
  // Cache the promise so concurrent requests share one Horizon call.
  const value = fetchMidPrice();
  const entry = { value, expiresAt: Date.now() + TTL_MS };
  cache = entry;
  void value.then((v) => { if (v === null) entry.expiresAt = Date.now() + FAILURE_TTL_MS; });
  return value;
}
