import { describe, it, expect, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { ApiRequestError, fromAxiosError } from '../../utils/apiError';
import { explainMintFailure, isBareGatewayError } from '../../utils/mintFailure';
import type { IssuedCredential } from '../../types/api';

const app = { applicationId: 'app-1', userId: 'user-1', courseId: 'course-1' };

function axios502(data: unknown) {
  const headers = new AxiosHeaders();
  return fromAxiosError(new AxiosError('Request failed with status code 502', 'ERR_BAD_RESPONSE', { headers }, null, {
    status: 502, statusText: 'Bad Gateway', data, headers, config: { headers },
  }));
}

const failedRow = { applicationId: 'app-1', mintStatus: 'failed', mintError: 'Simulation failed: HostError: contract trapped' } as IssuedCredential;

describe('mint failure message on the Admin Certificates page', () => {
  it('shows the API reason when the 502 body arrives intact, without an extra lookup', async () => {
    const err = axios502({ success: false, error: { code: 'MINT_FAILED', message: 'Soroban transaction failed: Send failed: tx_bad_seq' } });
    const load = vi.fn();
    expect(await explainMintFailure(err, app, load)).toBe('Soroban transaction failed: Send failed: tx_bad_seq');
    expect(load).not.toHaveBeenCalled();
  });

  it('reads the stored reason back when the edge replaced the 502 body with an HTML page', async () => {
    const err = axios502('<html><body>502 Bad Gateway</body></html>');
    expect(isBareGatewayError(err)).toBe(true);
    const load = vi.fn().mockResolvedValue([{ ...failedRow, applicationId: 'other' }, failedRow]);
    expect(await explainMintFailure(err, app, load)).toBe('Mint failed: Simulation failed: HostError: contract trapped');
    expect(load).toHaveBeenCalledWith({ courseId: 'course-1', userId: 'user-1', mintStatus: 'failed' });
  });

  it('never says "temporarily unavailable" for a lost mint reason', async () => {
    const err = axios502('');
    const message = await explainMintFailure(err, app, vi.fn().mockResolvedValue([]));
    expect(message).not.toMatch(/temporarily unavailable/i);
    expect(message).toMatch(/Issued certificates/);
  });

  it('keeps the plain message when the lookup itself fails', async () => {
    const message = await explainMintFailure(axios502(null), app, vi.fn().mockRejectedValue(new Error('down')));
    expect(message).toMatch(/did not reach this page/);
  });

  it('does not treat other errors as gateway errors', () => {
    expect(isBareGatewayError(new ApiRequestError({ message: 'x', status: 422, code: 'WALLET_NOT_LINKED' }))).toBe(false);
    expect(isBareGatewayError(new ApiRequestError({ message: 'x', status: 502, code: 'MINT_FAILED' }))).toBe(false);
  });
});
