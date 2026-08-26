// Validate critical secrets at startup
// NOTE: Rotate JWT_SECRET and JWT_REFRESH_SECRET periodically.
// When rotating, revoke all existing refresh tokens first.
const requiredEnvVars = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ADMIN_JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
  "SSO_SECRET",
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.TOTP_ENCRYPTION_KEY!)) {
  console.error("FATAL: TOTP_ENCRYPTION_KEY must be a 64-character hex string (openssl rand -hex 32)");
  process.exit(1);
}

// Minimum length validation for critical secrets
const secretMinLength = 16;
const secretVars = ["JWT_SECRET", "JWT_REFRESH_SECRET", "ADMIN_JWT_SECRET", "SSO_SECRET"] as const;
for (const s of secretVars) {
  if (process.env[s]!.length < secretMinLength) {
    console.error(`FATAL: ${s} must be at least ${secretMinLength} characters`);
    process.exit(1);
  }
}

// Key confusion guards — secrets MUST be unique
if (process.env.ADMIN_JWT_SECRET === process.env.JWT_SECRET) {
  console.error("FATAL: ADMIN_JWT_SECRET must differ from JWT_SECRET");
  process.exit(1);
}
if (process.env.SSO_SECRET === process.env.JWT_SECRET) {
  console.error("FATAL: SSO_SECRET must differ from JWT_SECRET");
  process.exit(1);
}

// Crash on empty critical secrets in production (P2-4-F2)
if (process.env.NODE_ENV === "production") {
  if (!process.env.PLATFORM_SECRET) {
    console.error("FATAL: PLATFORM_SECRET must be set in production");
    process.exit(1);
  }
  if (!process.env.SIGNING_SECRET_KEY) {
    console.error("FATAL: SIGNING_SECRET_KEY must be set in production");
    process.exit(1);
  }
}

// Warn if STELLAR_NETWORK not explicitly set in production
if (!process.env.STELLAR_NETWORK && process.env.NODE_ENV === "production") {
  console.warn("WARNING: STELLAR_NETWORK not set — defaulting to testnet. Set STELLAR_NETWORK=public for mainnet.");
}

// Warn if TURNSTILE_SECRET_KEY is empty in production (P2-4-F4)
if (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV === "production") {
  console.warn("WARNING: TURNSTILE_SECRET_KEY is empty — Turnstile verification will be non-functional.");
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3001", 10),
  STELLAR_NETWORK: process.env.STELLAR_NETWORK || "testnet",
  HORIZON_URL: process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
  SOROBAN_RPC_URL: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  // camelCase alias used by nft.service.ts
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  WEB_APP_URL: process.env.WEB_APP_URL || "http://localhost:5173",
  API_BASE_URL: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || "3001"}`,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_EXPIRES_IN: parseInt(process.env.JWT_EXPIRES_IN || "900", 10),
  JWT_REFRESH_EXPIRES_IN: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || "604800", 10),

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || "",
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || "",
  // API keys for third-party integrations (comma-separated)
  API_KEYS: (process.env.API_KEYS || "").split(",").filter(Boolean),

  // Internal admin auth — separate secret from end-user JWT_SECRET
  // Admin tokens use type:"admin" claim and are verified by verifyInternalAdmin middleware.
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET!,
  ADMIN_JWT_EXPIRES_IN: parseInt(process.env.ADMIN_JWT_EXPIRES_IN || "3600", 10),

  // TOTP secret encryption — 32-byte hex string (64 hex chars) for AES-256-GCM
  TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY!,

  // SSO — delegated authentication for relying parties (e.g. LMS)
  SSO_SECRET: process.env.SSO_SECRET!,
  // Comma-separated list of allowed callback URL prefixes
  SSO_CALLBACK_WHITELIST: (process.env.SSO_CALLBACK_WHITELIST || "").split(",").filter(Boolean),

  // OAuth 2.1 multi-RP signing (ES256)
  OAUTH_SIGNING_KEY: process.env.OAUTH_SIGNING_KEY || "",
  OAUTH_SIGNING_KID: process.env.OAUTH_SIGNING_KID || "default-kid",

  // Platform fee
  PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT || "0.1"),
  PLATFORM_WALLET: process.env.PLATFORM_WALLET || "",
  PLATFORM_SECRET: process.env.PLATFORM_SECRET || "",

  // SMTP
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587"),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "Amma Wallet <noreply@ammawallet.com>",
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || "",
  FIAT_RAMP_FEE_PERCENT: parseFloat(process.env.FIAT_RAMP_FEE_PERCENT || "0.3"),
  FIAT_RAMP_PROVIDER: process.env.FIAT_RAMP_PROVIDER || "internal",

  // Stripe Crypto Onramp
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    onrampEnabled: process.env.STRIPE_ONRAMP_ENABLED === "true",
  },

  // Transak
  transak: {
    apiKey: process.env.TRANSAK_API_KEY || "",
    environment: process.env.TRANSAK_ENVIRONMENT || "STAGING",
    enabled: process.env.TRANSAK_ENABLED === "true",
  },  SIGNING_PUBLIC_KEY: process.env.SIGNING_PUBLIC_KEY || "",
  SIGNING_SECRET_KEY: process.env.SIGNING_SECRET_KEY || "",
  MONEYGRAM_RAMPS_URL: process.env.MONEYGRAM_RAMPS_URL || "https://extstellar.moneygram.com",
  MONEYGRAM_RAMPS_DOMAIN: process.env.MONEYGRAM_RAMPS_DOMAIN || "extstellar.moneygram.com",
  VAPID_EMAIL: process.env.VAPID_EMAIL || "mailto:noreply@ammawallet.com",
};
