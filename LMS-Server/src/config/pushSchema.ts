// Additive only: historical notifications are never replayed as new pushes.
export const pushSchemaTables = ['push_installations', 'push_outbox'];
export const pushSchema = `
CREATE TABLE IF NOT EXISTS push_installations (
  id TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0 AND generation <= 9007199254740991),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT,
  authorization_version INTEGER,
  token_issued_at INTEGER,
  expo_token TEXT UNIQUE,
  project_id TEXT,
  platform TEXT CHECK (platform IN ('android','ios')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  lease_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (enabled = 0 OR (user_id IS NOT NULL AND session_hash IS NOT NULL
    AND authorization_version IS NOT NULL AND token_issued_at IS NOT NULL
    AND expo_token IS NOT NULL AND project_id IS NOT NULL AND platform IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS push_outbox (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES push_installations(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','awaiting_receipt','delivered','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  receipt_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  claim_id TEXT,
  ticket_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(notification_id, installation_id, generation)
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_due ON push_outbox(state,next_attempt_at,lease_until);
CREATE INDEX IF NOT EXISTS idx_push_installations_user ON push_installations(user_id,enabled);
CREATE TRIGGER IF NOT EXISTS push_notification_outbox
AFTER INSERT ON notifications
BEGIN
  INSERT INTO push_outbox (id,notification_id,installation_id,generation,next_attempt_at,expires_at,created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, i.id, i.generation,
    unixepoch()*1000, unixepoch()*1000+86400000, unixepoch()*1000
  FROM push_installations i WHERE i.user_id=NEW.user_id AND i.enabled=1
    AND i.lease_expires_at>unixepoch()*1000
    AND NOT EXISTS (SELECT 1 FROM notification_preferences p
      WHERE p.user_id=NEW.user_id AND p.type=NEW.type AND p.enabled=0);
END;
`;
