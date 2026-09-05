/**
 * Webhook Seeding Helpers for E2E Payment Tests
 *
 * Provides utilities to simulate Paystack webhook events with valid HMAC
 * signatures for testing payment lifecycle flows.
 *
 * Guardrails:
 * - Test environment only (PAYSTACK_SECRET_KEY defaults to empty string).
 * - No production credentials or real payment transactions.
 * - Uses existing webhook endpoint — no backend changes required.
 */

import { createHmac } from 'crypto';
import type { APIRequestContext } from '@playwright/test';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

export interface WebhookPayload {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paid_at?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Compute HMAC-SHA512 signature for a Paystack webhook payload.
 */
export function computeSignature(payload: string): string {
  return createHmac('sha512', PAYSTACK_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Send a Paystack webhook event with a valid HMAC signature.
 * Returns the HTTP response.
 */
export async function sendWebhook(
  request: APIRequestContext,
  apiURL: string,
  payload: WebhookPayload,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const payloadStr = JSON.stringify(payload);
  const signature = computeSignature(payloadStr);

  const res = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
    data: payloadStr,
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // Response may not be JSON
  }

  return { status: res.status(), body };
}

/**
 * Send a charge.success webhook for a given reference.
 */
export async function sendChargeSuccess(
  request: APIRequestContext,
  apiURL: string,
  reference: string,
  amountCents: number,
  currency = 'ZAR',
): Promise<{ status: number; body: Record<string, unknown> }> {
  return sendWebhook(request, apiURL, {
    event: 'charge.success',
    data: {
      reference,
      amount: amountCents,
      currency,
      status: 'success',
      paid_at: new Date().toISOString(),
    },
  });
}

/**
 * Send a charge.failed webhook for a given reference.
 */
export async function sendChargeFailed(
  request: APIRequestContext,
  apiURL: string,
  reference: string,
  amountCents: number,
  currency = 'ZAR',
): Promise<{ status: number; body: Record<string, unknown> }> {
  return sendWebhook(request, apiURL, {
    event: 'charge.failed',
    data: {
      reference,
      amount: amountCents,
      currency,
      status: 'failed',
    },
  });
}

/**
 * Send a refund.processed webhook for a given reference.
 */
export async function sendRefundProcessed(
  request: APIRequestContext,
  apiURL: string,
  reference: string,
  amountCents: number,
  currency = 'ZAR',
): Promise<{ status: number; body: Record<string, unknown> }> {
  return sendWebhook(request, apiURL, {
    event: 'refund.processed',
    data: {
      reference,
      amount: amountCents,
      currency,
      status: 'processed',
    },
  });
}

/**
 * Send the same webhook payload twice and return both responses.
 * Useful for testing idempotency.
 */
export async function sendDuplicateWebhook(
  request: APIRequestContext,
  apiURL: string,
  payload: WebhookPayload,
): Promise<{ first: { status: number; body: Record<string, unknown> }; second: { status: number; body: Record<string, unknown> } }> {
  const first = await sendWebhook(request, apiURL, payload);
  const second = await sendWebhook(request, apiURL, payload);
  return { first, second };
}
