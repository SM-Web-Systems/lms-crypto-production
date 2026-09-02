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
  | "nft_collection_synced"
  | "fiat_stripe_session"
  | "fiat_transak_url"
  | "admin_credit"
  | "admin_suspend"
  | "admin_unsuspend"
  | "admin_create"
  | "admin_deactivate"
  | "admin_reactivate"
  | "admin_billing_policy"
  | "admin_reset_password"
  | "oauth_consent_granted"
  | "oauth_consent_revoked";

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
