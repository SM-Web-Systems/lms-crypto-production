// LMS-WP1: standards Web Push (VAPID) for the home-screen web app, including iPhone (iOS 16.4+).
// Additive only: historical notifications are never replayed as new pushes.
export const webPushSchemaTables = ['web_push_subscriptions', 'web_push_outbox'];
export const webPushSchema = `
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  authorization_version INTEGER NOT NULL,
  token_issued_at INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_push_outbox (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','delivered','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  claim_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_due ON web_push_outbox(state,next_attempt_at,lease_until);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON web_push_subscriptions(user_id);
CREATE TRIGGER IF NOT EXISTS web_push_notification_outbox
AFTER INSERT ON notifications
BEGIN
  INSERT INTO web_push_outbox (id,notification_id,subscription_id,next_attempt_at,expires_at,created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, s.id,
    unixepoch()*1000, unixepoch()*1000+86400000, unixepoch()*1000
  FROM web_push_subscriptions s WHERE s.user_id=NEW.user_id
    AND s.lease_expires_at>unixepoch()*1000
    AND NOT EXISTS (SELECT 1 FROM notification_preferences p
      WHERE p.user_id=NEW.user_id AND p.type=NEW.type AND p.enabled=0);
END;
`;
