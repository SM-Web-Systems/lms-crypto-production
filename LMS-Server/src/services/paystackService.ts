/**
 * paystackService — Phase 12 C1: Paystack checkout + webhook verification + refund.
 *
 * Paystack amounts are integer subunits of the transaction currency.
 * Webhook signature: HMAC SHA-512 of raw body with PAYSTACK_SECRET_KEY.
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

/**
 * Verify webhook signature (HMAC SHA-512).
 * Returns true if signature is valid.
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  if (!isPaystackConfigured()) return false;
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  // Timing-safe comparison to prevent side-channel attacks (FIND-SEC-004)
  const hashBuf = Buffer.from(hash, 'hex');
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (hashBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, sigBuf);
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
