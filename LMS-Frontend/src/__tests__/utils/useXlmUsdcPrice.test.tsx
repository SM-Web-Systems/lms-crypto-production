import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn();
vi.mock('../../services/api', () => ({ default: { get: (...args: unknown[]) => get(...args) } }));

import { useXlmUsdcPrice, resetXlmUsdcPrice } from '../../hooks/useXlmUsdcPrice';

beforeEach(() => {
  get.mockReset();
  resetXlmUsdcPrice();
});

describe('useXlmUsdcPrice', () => {
  it('reads the price from the LMS server once and shares it', async () => {
    get.mockResolvedValue({ data: { success: true, data: { xlmUsdc: 0.3 } } });
    const a = renderHook(() => useXlmUsdcPrice());
    const b = renderHook(() => useXlmUsdcPrice());
    await waitFor(() => expect(a.result.current).toBe(0.3));
    await waitFor(() => expect(b.result.current).toBe(0.3));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/prices/xlm-usdc');
  });

  it('stays null when the price request fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useXlmUsdcPrice());
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
