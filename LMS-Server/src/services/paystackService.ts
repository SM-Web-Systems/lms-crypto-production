/**
 * paystackService — Phase 12 C1: Paystack checkout + webhook verification + refund.
 *
 * Uses Paystack REST API v2. All amounts in kobo (cents * 100 for ZAR, or cents for USD).
 * Webhook signature: HMAC SHA-512 of raw body with PAYSTACK_SECRET_KEY.
 */

import crypto from 'crypto';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

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
  };
}

interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    status: string;
    amount: number;
  };
}

/**
 * Initialize a Paystack transaction (hosted checkout).
 * Returns authorization_url for redirect + access_code + reference.
 */
export async function initializeTransaction(
  email: string,
  amountCents: number,
  reference: string,
  callbackUrl: string,
  metadata?: Record<string, unknown>,
): Promise<PaystackInitResponse['data']> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountCents, // Paystack expects amount in smallest currency unit
      currency: 'USD',
      reference,
      callback_url: callbackUrl,
      metadata: metadata ?? {},
    }),
  });

  const json = (await res.json()) as PaystackInitResponse;
  if (!json.status) {
    throw new Error(`Paystack initialization failed: ${json.message}`);
  }
  return json.data;
}

/**
 * Verify a transaction by reference.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse['data']> {
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
  if (!PAYSTACK_SECRET_KEY) return false;
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}

/**
 * Create a refund for a Paystack transaction.
 */
export async function createRefund(
  reference: string,
  merchantNote?: string,
): Promise<PaystackRefundResponse['data']> {
  const body: Record<string, unknown> = { transaction: reference };
  if (merchantNote) body.merchant_note = merchantNote;

  const res = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as PaystackRefundResponse;
  if (!json.status) {
    throw new Error(`Paystack refund failed: ${json.message}`);
  }
  return json.data;
}
