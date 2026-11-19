import { ApiRequestError, getErrorMessage } from './apiError';
import type { IssuedCredential, NftApplication } from '../types/api';

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * True when a failed request came back as a bare gateway error: a 502/503/504 whose body was not the
 * API's own JSON (no error code). The API's mint route answers 502 with the real reason, but the edge
 * proxy can replace that body, which left the page showing "The server is temporarily unavailable".
 */
export function isBareGatewayError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status != null && GATEWAY_STATUSES.has(err.status) && !err.code;
}

/**
 * The message to show after a mint fails. When the API's reason was lost on the way, the failed mint is
 * still stored with its reason, so read it back from the issued credentials list.
 */
export async function explainMintFailure(
  err: unknown,
  app: Pick<NftApplication, 'applicationId' | 'userId' | 'courseId'>,
  loadCredentials: (params: { courseId: string; userId: string; mintStatus: 'failed' }) => Promise<IssuedCredential[]>,
): Promise<string> {
  const fallback = getErrorMessage(err, 'Mint failed.');
  if (!isBareGatewayError(err)) return fallback;
  try {
    const rows = await loadCredentials({ courseId: app.courseId, userId: app.userId, mintStatus: 'failed' });
    const row = rows.find((r) => r.applicationId === app.applicationId && r.mintError);
    if (row?.mintError) return `Mint failed: ${row.mintError}`;
  } catch {
    /* fall through to the generic text */
  }
  return 'Mint failed, and the server’s reason did not reach this page. Check the Issued NFTs tab for the stored error before trying again.';
}
