import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import api from '../../services/api';
import { ApiRequestError } from '../../utils/apiError';
import { downloadWithSession } from '../../services/download';

const createObjectURL = vi.fn(() => 'blob:fixture');
const revokeObjectURL = vi.fn();
let savedAs: string[] = [];
const originalAdapter = api.defaults.adapter;

function respond(status: number, data: Blob): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const response = { status, statusText: '', data, headers: {}, config } as AxiosResponse;
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, null, response);
  };
}

beforeEach(() => {
  savedAs = [];
  localStorage.setItem('lms_session_marker', 'learner-session');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    savedAs.push(this.download);
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  localStorage.removeItem('lms_session_marker');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('saves the response under the given filename', async () => {
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  api.defaults.adapter = respond(200, pdf);

  await downloadWithSession('/payments/pay-1/receipt', 'receipt-pay-1.pdf');

  expect(createObjectURL).toHaveBeenCalledWith(pdf);
  expect(savedAs).toEqual(['receipt-pay-1.pdf']);
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});

it('reads the JSON error inside a Blob error body', async () => {
  const body = new Blob([JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } })], {
    type: 'application/json',
  });
  api.defaults.adapter = respond(404, body);

  const failure = downloadWithSession('/payments/missing/receipt', 'receipt-missing.pdf');

  await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
  await expect(failure).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Payment not found' });
  expect(savedAs).toEqual([]);
});

it('refuses to start when signed out', async () => {
  localStorage.removeItem('lms_session_marker');
  await expect(downloadWithSession('/payments/pay-1/receipt', 'r.pdf')).rejects.toThrow('Please sign in');
});
