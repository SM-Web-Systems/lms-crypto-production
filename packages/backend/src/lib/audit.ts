import { db, schema } from "../db";

export type AuditAction =
  | "login"
  | "login_failed"
  | "login_locked"
  | "register"
  | "logout"
  | "password_change"
  | "password_reset"
  | "password_reset_request"
  | "profile_update"
  | "2fa_enable"
  | "2fa_disable"
  | "signing_mode_change"
  | "transaction_sign"
  | "transaction_submit"
  | "wallet_add"
  | "wallet_remove"
  | "api_key_create"
  | "api_key_revoke"
  | "nft_collection_registered"
  | "nft_transfer"
  | "nft_mint_indexed"
  | "nft_collection_synced";

export async function auditLog(
  action: AuditAction,
  opts: {
    userId?: number;
    detail?: Record<string, any>;
    ip?: string;
    userAgent?: string;
  } = {}
): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      userId: opts.userId ?? null,
      action,
      detail: opts.detail ?? {},
      ipAddress: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    });
  } catch (err) {
    // Never let audit logging crash the app
    console.error("[audit] Failed to write log:", err);
  }
}
