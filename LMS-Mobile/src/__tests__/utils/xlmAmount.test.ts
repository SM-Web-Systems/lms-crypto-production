import { renderHook, waitFor } from '@testing-library/react-native';
import api from '@/lib/api';
import { formatXlm } from '@/utils/xlmAmount';
import { useXlmUsdcPrice, resetXlmUsdcPrice } from '@/hooks/useXlmUsdcPrice';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

describe('formatXlm', () => {
  it('shows the USDC value next to the XLM amount when a price exists', () => {
    expect(formatXlm(2_000_000, 0.3)).toBe('0.2 XLM (≈ 0.06 USDC)');
  });

  it('shows only the XLM amount when there is no price', () => {
    expect(formatXlm(2_000_000, null)).toBe('0.2 XLM');
    expect(formatXlm(100_000_000)).toBe('10 XLM');
  });

  it('keeps full precision and never rounds a tiny amount to zero', () => {
    expect(formatXlm(1)).toBe('0.0000001 XLM');
    expect(formatXlm(1, 0.3)).toBe('0.0000001 XLM (< 0.01 USDC)');
  });

  it('uses the record currency and adds no USDC value to a non-XLM amount', () => {
    expect(formatXlm(2_000_000, 0.3, 'USDC')).toBe('0.2 USDC');
  });
});

describe('useXlmUsdcPrice', () => {
  beforeEach(() => { get.mockReset(); resetXlmUsdcPrice(); });

  it('reads the price from the LMS server', async () => {
    get.mockResolvedValue({ data: { success: true, data: { xlmUsdc: 0.3 } } });
    const { result } = renderHook(() => useXlmUsdcPrice());
    await waitFor(() => expect(result.current).toBe(0.3));
    expect(get).toHaveBeenCalledWith('/prices/xlm-usdc');
  });

  it('stays null when the request fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useXlmUsdcPrice());
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
