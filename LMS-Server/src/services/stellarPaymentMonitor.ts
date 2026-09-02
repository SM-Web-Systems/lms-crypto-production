/**
 * stellarPaymentMonitor — Phase 12 C1: Background Stellar payment polling.
 *
 * Polls Horizon API for incoming payments to PAYMENT_RECEIVING_WALLET.
 * Matches transaction memos to payments.stellar_memo for auto-confirmation.
 *
 * Only runs when STELLAR_MONITOR_ENABLED=true (disabled in tests).
 */

import { getPaymentByStellarMemo, confirmPayment } from './paymentService.js';
import { queryOne, execute } from '../config/database.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
const RECEIVING_WALLET = process.env.PAYMENT_RECEIVING_WALLET || '';

// USDC issuer on mainnet
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

interface HorizonPayment {
  id: string;
  type: string;
  transaction_hash: string;
  source_account: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  paging_token: string;
}

interface HorizonTransaction {
  hash: string;
  memo_type?: string;
  memo?: string;
}

interface HorizonResponse {
  _embedded: {
    records: HorizonPayment[];
  };
}

export class StellarPaymentMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private cursor: string | null = null;
  private running = false;

  constructor() {
    // Load persisted cursor
    this.loadCursor();
  }

  start(): void {
    if (this.intervalId) return;
    if (!RECEIVING_WALLET) {
      logger.warn({ module: 'StellarPaymentMonitor' }, 'PAYMENT_RECEIVING_WALLET not set, skipping');
      return;
    }
    logger.info({ module: 'StellarPaymentMonitor', wallet: RECEIVING_WALLET, intervalSec: POLL_INTERVAL_MS / 1000 }, 'Starting payment polling');
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Initial poll
    this.poll();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private loadCursor(): void {
    try {
      const row = queryOne<{ cursor_value: string }>(
        "SELECT cursor_value FROM stellar_monitor_state WHERE id = 'payment_cursor'",
      );
      if (row) this.cursor = row.cursor_value;
    } catch {
      // Table may not exist yet on first run — will be created below
    }
  }

  private saveCursor(cursor: string): void {
    try {
      execute(`
        INSERT INTO stellar_monitor_state (id, cursor_value, updated_at)
        VALUES ('payment_cursor', ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET cursor_value = ?, updated_at = datetime('now')
      `, [cursor, cursor]);
    } catch {
      // Silently fail — cursor will be re-fetched next restart
    }
  }

  async poll(): Promise<void> {
    if (this.running) return; // Prevent overlap
    this.running = true;

    try {
      let url = `${HORIZON_URL}/accounts/${RECEIVING_WALLET}/payments?order=asc&limit=50`;
      if (this.cursor) url += `&cursor=${this.cursor}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        logger.error({ module: 'StellarPaymentMonitor', status: res.status }, 'Horizon returned error');
        return;
      }

      const json = (await res.json()) as HorizonResponse;
      const payments = json._embedded?.records ?? [];

      for (const payment of payments) {
        // Update cursor
        this.cursor = payment.paging_token;

        // Only process payment operations (not create_account, etc.)
        if (payment.type !== 'payment') continue;

        // Check if it's XLM or USDC
        const isXlm = payment.asset_type === 'native';
        const isUsdc = payment.asset_code === 'USDC' && payment.asset_issuer === USDC_ISSUER;
        if (!isXlm && !isUsdc) continue;

        // Fetch transaction to get memo
        try {
          const txController = new AbortController();
          const txTimeout = setTimeout(() => txController.abort(), 30_000);
          let txRes: Response;
          try {
            txRes = await fetch(`${HORIZON_URL}/transactions/${payment.transaction_hash}`, { signal: txController.signal });
          } finally {
            clearTimeout(txTimeout);
          }
          if (!txRes.ok) continue;
          const tx = (await txRes.json()) as HorizonTransaction;

          if (tx.memo_type !== 'text' || !tx.memo) continue;

          // Match memo to pending payment
          const dbPayment = getPaymentByStellarMemo(tx.memo);
          if (!dbPayment || dbPayment.status !== 'pending') continue;

          // Verify amount — reject dust payments (FIND-010a)
          const receivedAmount = parseFloat(payment.amount);
          const expectedAmount = (dbPayment as any).stellar_expected_amount as number | null;

          if (expectedAmount != null && expectedAmount > 0) {
            // Reject if received < 99% of expected (tolerance for rounding)
            const minAcceptable = expectedAmount * 0.99;
            if (receivedAmount < minAcceptable) {
              logger.warn({
                module: 'StellarPaymentMonitor',
                paymentId: dbPayment.id,
                txHash: payment.transaction_hash,
                receivedAmount,
                expectedAmount,
                minAcceptable,
              }, 'Payment amount too low — rejecting dust payment');
              continue;
            }
          } else {
            // No expected amount stored — log warning but still confirm
            // (legacy payments created before this column was added)
            logger.warn({
              module: 'StellarPaymentMonitor',
              paymentId: dbPayment.id,
              receivedAmount,
            }, 'No stellar_expected_amount stored — confirming without amount check');
          }

          // Update with tx hash and confirm
          execute(
            "UPDATE payments SET stellar_tx_hash = ?, updated_at = datetime('now') WHERE id = ?",
            [payment.transaction_hash, dbPayment.id],
          );
          confirmPayment(dbPayment.id, 'stellar-monitor', `Auto-confirmed via Stellar tx ${payment.transaction_hash} (received: ${receivedAmount})`);

          logger.info({ module: 'StellarPaymentMonitor', paymentId: dbPayment.id, txHash: payment.transaction_hash, receivedAmount, expectedAmount }, 'Payment confirmed');
        } catch (err) {
          logger.error({ module: 'StellarPaymentMonitor', txHash: payment.transaction_hash, err }, 'Error processing transaction');
        }
      }

      // Persist cursor
      if (this.cursor) this.saveCursor(this.cursor);
    } catch (err) {
      logger.error({ module: 'StellarPaymentMonitor', err }, 'Poll error');
    } finally {
      this.running = false;
    }
  }
}

// Ensure cursor persistence table exists
try {
  const { db } = await import('../config/database.js');
  db.exec(`
    CREATE TABLE IF NOT EXISTS stellar_monitor_state (
      id           TEXT PRIMARY KEY,
      cursor_value TEXT NOT NULL,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch {
  // Module-level init — may fail in tests where db isn't fully initialized
}

/** Singleton instance — call start() to begin polling. */
export const stellarMonitor = new StellarPaymentMonitor();
