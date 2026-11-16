import logger from '../../utils/logger.js';
import { detectBackingDeposits } from './platformCreditService.js';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Every 30 seconds, matches open backing requests to payments on the network. Off with BACKING_DEPOSIT_WATCHER=off. Failures are logged, never thrown. */
export function startBackingDepositWatcher(): void {
  if (timer || process.env.BACKING_DEPOSIT_WATCHER === 'off') return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const recorded = await detectBackingDeposits();
      if (recorded) logger.info({ module: 'backing-deposit-watcher', recorded }, 'Backing deposits recorded automatically');
    } catch (err) { logger.error({ module: 'backing-deposit-watcher', err }, 'Backing deposit check could not run'); }
    finally { running = false; }
  };
  timer = setInterval(() => { void run(); }, 30_000);
  timer.unref();
}
