import { Router, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { WebPushError, webPushConfiguration, saveSubscription, removeSubscription } from '../services/webPushService.js';
import { createNotification } from '../services/notificationService.js';

// LMS-WP1: Web Push for the home-screen web app (iPhone iOS 16.4+, Android, desktop).
const router = Router();
const testLimiter = rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
function handle(work: (req: AuthRequest) => unknown) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: work(req) }); }
    catch (error) { if (error instanceof WebPushError) res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } }); else next(error); }
  };
}
// The VAPID public key is public by design; the private key never leaves the server environment.
router.get('/notifications/push/web/config', authenticate, handle(() => {
  const { enabled, publicKey } = webPushConfiguration(); return { enabled, publicKey: enabled ? publicKey : null };
}));
router.put('/notifications/push/web/subscription', authenticate, handle(req => saveSubscription(req.body, (req as AuthRequest).authToken!)));
router.post('/notifications/push/web/unsubscribe', authenticate, handle(req => removeSubscription(req.body, req.user!.userId)));
// Lets a tester prove delivery end to end: it creates an ordinary notification for the caller only.
router.post('/notifications/push/web/test', authenticate, testLimiter, handle(req => {
  if (!webPushConfiguration().enabled) throw new WebPushError(503, 'PUSH_UNAVAILABLE', 'Web push is not configured.');
  createNotification({ userId: req.user!.userId, type: 'push_test', title: 'Test notification',
    body: 'This is a test push notification from the LMS.', force: true });
  return { queued: true };
}));
export default router;
