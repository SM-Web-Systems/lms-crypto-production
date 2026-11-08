/**
 * paystackService — Phase 12 C1: Paystack checkout + webhook verification + refund.
 *
 * Paystack amounts are integer subunits of the transaction currency.
 * Webhook verification uses the configured Paystack signing secret or legacy API key.
 */

import crypto from 'crypto';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY?.trim() ?? '';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export function isPaystackConfigured(): boolean {
  if (!PAYSTACK_SECRET_KEY) return false;
  const mode = process.env.PAYSTACK_REQUIRED_MODE;
  if (mode === undefined) return true;
  if (mode !== 'test' && mode !== 'live') return false;
  const prefix = `sk_${mode}_`;
  return PAYSTACK_SECRET_KEY.startsWith(prefix) && PAYSTACK_SECRET_KEY.length > prefix.length;
}

function requirePaystackConfigured(): void {
  if (!isPaystackConfigured()) throw new Error('Paystack is unavailable');
}

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string; // 'success' | 'failed' | 'abandoned'
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string;
    metadata: Record<string, unknown>;
    customer?: { email: string };
  };
}

interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    transaction: { reference: string };
    status: string;
    amount: number;
    currency: string;
  };
}

/**
 * Initialize a Paystack transaction (hosted checkout).
 * Returns authorization_url for redirect + access_code + reference.
 */
export async function initializeTransaction(
  email: string,
  amountCents: number,
  currency: string,
  reference: string,
  callbackUrl: string,
  metadata?: Record<string, unknown>,
): Promise<PaystackInitResponse['data']> {
  requirePaystackConfigured();
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountCents, // Paystack expects amount in smallest currency unit
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: JSON.stringify(metadata ?? {}),
    }),
  });

  const json = (await res.json()) as PaystackInitResponse;
  if (!res.ok || json.status !== true || json.data?.reference !== reference ||
      typeof json.data.access_code !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(json.data.access_code) ||
      typeof json.data.authorization_url !== 'string') {
    throw new Error('Paystack returned invalid checkout evidence');
  }
  const checkout = new URL(json.data.authorization_url);
  if (checkout.origin !== 'https://checkout.paystack.com' || checkout.username || checkout.password) {
    throw new Error('Paystack returned an unexpected checkout destination');
  }
  return json.data;
}

/**
 * Verify a transaction by reference.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse['data']> {
  requirePaystackConfigured();
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });

  const json = (await res.json()) as PaystackVerifyResponse;
  if (!json.status) {
    throw new Error(`Paystack verification failed: ${json.message}`);
  }
  return json.data;
}

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

function verifyTimestampedSignature(
  rawBody: string | Buffer,
  header: string,
  signingSecrets: string[],
): boolean {
  let timestamp: string | undefined;
  const signatures: Buffer[] = [];
  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;
    const name = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();

    if (name === 't') {
      if (timestamp !== undefined || !/^\d+$/.test(value)) return false;
      timestamp = value;
    } else if (name === 'v1') {
      const match = /^whk_[A-Za-z0-9_-]+:([a-f0-9]{128})$/.exec(value);
      if (match) signatures.push(Buffer.from(match[1], 'hex'));
    }
  }

  if (timestamp === undefined || signatures.length === 0) return false;
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) ||
      Math.abs(Math.floor(Date.now() / 1000) - time) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return false;

  return signingSecrets.some(secret => {
    const expected = crypto.createHmac('sha512', secret).update(timestamp + '.').update(rawBody).digest();
    return signatures.some(signature => crypto.timingSafeEqual(expected, signature));
  });
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  legacySignature: string | undefined,
  timestampedSignature?: string,
): boolean {
  if (!isPaystackConfigured()) return false;
  const current = process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
  const previous = process.env.PAYSTACK_WEBHOOK_PREVIOUS_SECRET?.trim();
  if (current || previous) {
    // Configuring the new signer opts this endpoint out of legacy verification.
    if (!current || !/^whsec_\S+$/.test(current) || (previous && !/^whsec_\S+$/.test(previous)) ||
        !timestampedSignature) return false;
    return verifyTimestampedSignature(rawBody, timestampedSignature, previous ? [current, previous] : [current]);
  }

  if (!legacySignature || !/^[a-f0-9]{128}$/i.test(legacySignature)) return false;
  const expected = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(legacySignature, 'hex'));
}

/**
 * Create a refund for a Paystack transaction.
 */
export async function createRefund(
  transactionReference: string,
  refundReference: string,
  amount: number,
  currency: string,
  merchantNote?: string,
): Promise<void> {
  requirePaystackConfigured();
  const res = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transaction: transactionReference, reference: refundReference, amount, currency, merchant_note: merchantNote }),
  });

  const json = (await res.json()) as PaystackRefundResponse;
  const data = json.data;
  if (!res.ok || json.status !== true || data?.reference !== refundReference ||
      data.transaction?.reference !== transactionReference || data.amount !== amount || data.currency !== currency ||
      !['pending', 'processing', 'processed'].includes(data.status)) {
    throw new Error('Paystack refund response requires reconciliation');
  }
}
