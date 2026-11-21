import { useEffect, useState } from 'react';
import api from '../services/api';

const TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 60_000;
let cached: { expiresAt: number; price: Promise<number | null> } | null = null;

async function loadPrice(): Promise<number | null> {
  try {
    const res = await api.get<{ data?: { xlmUsdc?: number | null } }>('/prices/xlm-usdc');
    const price = res?.data?.data?.xlmUsdc;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** For tests. */
export function resetXlmUsdcPrice(): void {
  cached = null;
}

/** USDC per XLM from GET /prices/xlm-usdc, shared by every caller for 5 minutes (1 minute after a failure); null when unavailable. */
export function useXlmUsdcPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!cached || Date.now() > cached.expiresAt) {
      const entry = { expiresAt: Date.now() + TTL_MS, price: loadPrice() };
      void entry.price.then((p) => { if (p === null) entry.expiresAt = Date.now() + FAILURE_TTL_MS; });
      cached = entry;
    }
    let live = true;
    void cached.price.then((p) => { if (live) setPrice(p); });
    return () => { live = false; };
  }, []);
  return price;
}
