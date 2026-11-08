import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../services/api';
import { sponsorService } from '../services/sponsorService';

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
  setTokenGetter: vi.fn(),
  onUnauthorized: () => () => {},
}));

const createObjectURL = vi.fn(() => 'blob:fixture');
const revokeObjectURL = vi.fn();
const click = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('lms_token', 'original-sponsor-session');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
});

afterEach(() => {
  localStorage.removeItem('lms_token');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['receipt after sign-out', () => sponsorService.downloadReceipt('payment-1'), null],
  ['roster CSV after account switch', () => sponsorService.exportCoursesCsv(), 'new-sponsor-session'],
  ['impact CSV after account switch', () => sponsorService.exportImpactCsv(), 'new-sponsor-session'],
] as const)('discards a delayed %s', async (_scenario, start, nextToken) => {
  let resolve!: (response: { data: Blob }) => void;
  vi.mocked(api.get).mockReturnValueOnce(new Promise(done => { resolve = done; }));

  const pending = start();
  if (nextToken) localStorage.setItem('lms_token', nextToken);
  else localStorage.removeItem('lms_token');
  resolve({ data: new Blob(['private sponsor report']) });

  await expect(pending).rejects.toThrow('Your session changed');
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
});

it('pins the request to the current session and downloads while that session remains current', async () => {
  const pdf = new Blob(['receipt'], {type:'application/pdf'});
  vi.mocked(api.get).mockResolvedValueOnce({ data: pdf });

  await sponsorService.downloadReceipt('payment-1');

  expect(api.get).toHaveBeenCalledWith('/payments/payment-1/receipt', expect.objectContaining({
    headers: { Authorization: 'Bearer original-sponsor-session' },
    responseType: 'blob',
  }));
  expect(createObjectURL).toHaveBeenCalledWith(pdf);
  expect(click).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});
