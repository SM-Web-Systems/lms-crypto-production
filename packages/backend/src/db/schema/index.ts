import {
  pgTable,
  bigserial,
  text,
  numeric,
  integer,
  smallint,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  bigint,
  varchar,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ════════════════════════════════════════════
// Tokens — The master token registry
// ════════════════════════════════════════════

export const tokens = pgTable(
  "tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assetType: text("asset_type").notNull(),
    assetCode: text("asset_code"),
    assetIssuer: text("asset_issuer"),
    homeDomain: text("home_domain"),

    tomlName: text("toml_name"),
    tomlOrg: text("toml_org"),
    tomlImage: text("toml_image"),
    tomlDesc: text("toml_desc"),
    tomlStatus: text("toml_status"),
    anchorAsset: text("anchor_asset"),
    anchorType: text("anchor_type"),

    totalSupply: numeric("total_supply"),
    trustlineCount: integer("trustline_count").default(0),
    fundedTrustlines: integer("funded_trustlines").default(0),
    paymentCount: bigint("payment_count", { mode: "number" }).default(0),
    tradeCount: bigint("trade_count", { mode: "number" }).default(0),
    volume7d: numeric("volume_7d").default("0"),

    ratingAge: smallint("rating_age").default(0),
    ratingTrades: smallint("rating_trades").default(0),
    ratingPayments: smallint("rating_payments").default(0),
    ratingTrustlines: smallint("rating_trustlines").default(0),
    ratingVolume: smallint("rating_volume").default(0),
    ratingLiquidity: smallint("rating_liquidity").default(0),
    ratingInterop: smallint("rating_interop").default(0),
    ratingAverage: numeric("rating_average", { precision: 3, scale: 1 }).default("0"),

    isVerified: boolean("is_verified").default(false),
    isSpam: boolean("is_spam").default(false),
    isFeatured: boolean("is_featured").default(false),

    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    localIcon: text('local_icon'),
    network: varchar("network", { length: 10 }).notNull().default('pubnet'),
  },
  (table) => [
    uniqueIndex("idx_tokens_code_issuer").on(table.assetCode, table.assetIssuer),
    index("idx_tokens_code").on(table.assetCode),
    index("idx_tokens_issuer").on(table.assetIssuer),
    index("idx_tokens_rating").on(table.ratingAverage),
    index("idx_tokens_domain").on(table.homeDomain),
  ]
);

// ════════════════════════════════════════════
// Contract Tokens — Soroban SEP-41 + SAC
// ════════════════════════════════════════════

export const contractTokens = pgTable("contract_tokens", {
  id: text("id").primaryKey(),
  contractType: text("contract_type").notNull(),
  assetCode: text("asset_code"),
  assetIssuer: text("asset_issuer"),
  name: text("name"),
  symbol: text("symbol"),
  decimals: smallint("decimals").notNull().default(7),
  tokenId: bigint("token_id", { mode: "number" }).references(() => tokens.id),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ════════════════════════════════════════════
// User Tokens — Per-user token preferences
// ════════════════════════════════════════════

export const userTokens = pgTable(
  "user_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicKey: text("public_key").notNull(),
    tokenId: bigint("token_id", { mode: "number" }).references(() => tokens.id),
    contractId: text("contract_id").references(() => contractTokens.id),
    isFavorite: boolean("is_favorite").default(false),
    isHidden: boolean("is_hidden").default(false),
    displayOrder: integer("display_order").default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_tokens_pubkey_token").on(table.publicKey, table.tokenId),
    index("idx_user_tokens_pubkey").on(table.publicKey),
  ]
);

// ════════════════════════════════════════════
// Transaction History Cache
// ════════════════════════════════════════════

export const txHistory = pgTable(
  "tx_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicKey: text("public_key").notNull(),
    txHash: text("tx_hash").notNull().unique(),
    ledgerNumber: bigint("ledger_number", { mode: "number" }),
    operationType: text("operation_type").notNull(),
    assetCode: text("asset_code"),
    assetIssuer: text("asset_issuer"),
    amount: numeric("amount"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    memo: text("memo"),
    memoType: text("memo_type"),
    feeCharged: bigint("fee_charged", { mode: "number" }),
    successful: boolean("successful").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_tx_history_pubkey").on(table.publicKey, table.createdAt),
    index("idx_tx_history_hash").on(table.txHash),
  ]
);

// ════════════════════════════════════════════
// Liquidity Pools
// ════════════════════════════════════════════

export const liquidityPools = pgTable(
  "liquidity_pools",
  {
    poolId: text("pool_id").primaryKey(),
    assetACode: text("asset_a_code").notNull(),
    assetAIssuer: text("asset_a_issuer"),
    assetBCode: text("asset_b_code").notNull(),
    assetBIssuer: text("asset_b_issuer"),
    feeBp: integer("fee_bp").default(30),
    reserveA: numeric("reserve_a"),
    reserveB: numeric("reserve_b"),
    totalShares: numeric("total_shares"),
    totalTrustlines: integer("total_trustlines"),
    spotPrice: numeric("spot_price"),
    volume24h: numeric("volume_24h").default("0"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_lp_assets").on(table.assetACode, table.assetBCode),
  ]
);

// ════════════════════════════════════════════
// Sync State
// ════════════════════════════════════════════

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ════════════════════════════════════════════
// Users — Authentication & Profile
// ════════════════════════════════════════════

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatar: text("avatar"),
    preferredLanguage: text("preferred_language").default("en"),
    preferredNetwork: text("preferred_network").default("public"),
    isEmailVerified: boolean("is_email_verified").default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    signingMode: text("signing_mode").default("delegated"), // 'self' | 'delegated'
    twoFaSecret: text("two_fa_secret"),
    twoFaEnabled: boolean("two_fa_enabled").default(false),
    twoFaMethod: text("two_fa_method").default("none"), // 'none' | 'totp'
    twoFaBackupCodes: text("two_fa_backup_codes"),
    twoFaStaticCode: text("two_fa_static_code"), // hashed user-chosen 6-digit code // JSON array of hashed codes
    phoneNumber: varchar("phone_number", { length: 20 }).unique(),
    phoneVerified: boolean("phone_verified").notNull().default(false),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lastFailedLogin: timestamp("last_failed_login"),
  },
  (table) => [
    uniqueIndex("idx_users_email").on(table.email),
  ]
);

// ════════════════════════════════════════════
// User Wallets — Linked Amma wallets
// ════════════════════════════════════════════

export const userWallets = pgTable(
  "user_wallets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    encryptedSecret: text("encrypted_secret"),
    network: text("network").notNull().default("public"),
    isActive: boolean("is_active").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_wallets_user_pubkey").on(table.userId, table.publicKey),
    index("idx_user_wallets_user").on(table.userId),
  ]
);

// ════════════════════════════════════════════
// Refresh Tokens — For JWT rotation
// ════════════════════════════════════════════

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_refresh_tokens_user").on(table.userId),
    index("idx_refresh_tokens_token").on(table.token),
  ]
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ════════════════════════════════════════════
// ALL Relations (must come after ALL tables)
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// Email Codes — 2FA and verification codes
// ════════════════════════════════════════════
export const emailCodes = pgTable(
  "email_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: text("type").notNull().default("login"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_email_codes_user").on(table.userId),
  ]
);

export const addressBook = pgTable("address_book", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  memo: text("memo"),
  memoType: text("memo_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});


export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  walletPublicKey: text("wallet_public_key").notNull(),
  totalXlm: numeric("total_xlm").notNull().default("0"),
  totalUsd: numeric("total_usd").notNull().default("0"),
  assetBreakdown: jsonb("asset_breakdown").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tokensRelations = relations(tokens, ({ many }) => ({
  contractTokens: many(contractTokens),
  userTokens: many(userTokens),
}));

export const contractTokensRelations = relations(contractTokens, ({ one }) => ({
  token: one(tokens, {
    fields: [contractTokens.tokenId],
    references: [tokens.id],
  }),
}));

export const userTokensRelations = relations(userTokens, ({ one }) => ({
  token: one(tokens, {
    fields: [userTokens.tokenId],
    references: [tokens.id],
  }),
  contract: one(contractTokens, {
    fields: [userTokens.contractId],
    references: [contractTokens.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(userWallets),
  refreshTokens: many(refreshTokens),
}));

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

// ════════════════════════════════════════════
// API Keys — For public API access
// ════════════════════════════════════════════

export const apiKeys = pgTable(
  "api_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    isActive: boolean("is_active").default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_api_keys_key").on(table.key),
    index("idx_api_keys_user").on(table.userId),
  ]
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

// Audit logs
export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  detail: jsonb("detail").default({}),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ════════════════════════════════════════════
// NFT Collections
// ════════════════════════════════════════════
export const nftCollections = pgTable("nft_collections", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: varchar("type", { length: 10 }).notNull().default("sep50"),
  contractId: varchar("contract_id", { length: 56 }).unique(),
  assetCode: varchar("asset_code", { length: 12 }),
  assetIssuer: varchar("asset_issuer", { length: 56 }),
  name: text("name"),
  symbol: varchar("symbol", { length: 20 }),
  baseUri: text("base_uri"),
  description: text("description"),
  image: text("image"),
  creator: varchar("creator", { length: 56 }),
  totalSupply: integer("total_supply").default(0),
  isVerified: boolean("is_verified").default(false),
  network: varchar("network", { length: 10 }).notNull().default("public"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ════════════════════════════════════════════
// NFT Tokens
// ════════════════════════════════════════════
export const nftTokens = pgTable("nft_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => nftCollections.id),
  tokenId: integer("token_id").notNull(),
  owner: varchar("owner", { length: 56 }),
  metadataUri: text("metadata_uri"),
  name: text("name"),
  description: text("description"),
  image: text("image"),
  attributes: jsonb("attributes").default([]),
  isBurned: boolean("is_burned").default(false),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_nft_collection_token").on(table.collectionId, table.tokenId),
]);

export const nftCollectionsRelations = relations(nftCollections, ({ many }) => ({
  tokens: many(nftTokens),
}));

export const nftTokensRelations = relations(nftTokens, ({ one }) => ({
  collection: one(nftCollections, {
    fields: [nftTokens.collectionId],
    references: [nftCollections.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 0: MULTI-TENANT COMMERCIAL TABLES — 22 new tables
// Added: 2026-07-17 | Source: phase0-checklist-v3.md (FINAL)
// Creation order matches checklist dependency order.
// ═══════════════════════════════════════════════════════════════════════════

// ── TABLE 1: tenants ──────────────────────────────────────────────────────
// Root identity for each business customer. All multi-tenant tables FK here.
// prepaid_xlm_balance has NO floor CHECK constraint — acquisition mode allows
// arbitrary negative balance enforced only at application layer.
export const tenants = pgTable(
  "tenants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    slug: text("slug").unique().notNull(),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    prepaidXlmBalance: numeric("prepaid_xlm_balance", { precision: 18, scale: 7 }).notNull().default("0"),
    lowBalanceThresholdXlm: numeric("low_balance_threshold_xlm", { precision: 18, scale: 7 }).notNull().default("300.0000000"),
    webhookUrl: text("webhook_url"),
    isActive: boolean("is_active").notNull().default(true),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    allowProvisioningQueue: boolean("allow_provisioning_queue").notNull().default(false),
    queueMaxDays: integer("queue_max_days").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_tenants_slug").on(table.slug),
    index("idx_tenants_balance").on(table.prepaidXlmBalance),
    index("idx_tenants_active").on(table.isActive),
    check(
      "chk_suspension_reason",
      sql`${table.suspensionReason} IS NULL OR ${table.suspensionReason} IN ('debt_limit', 'maintenance_grace_expired', 'manual')`,
    ),
  ],
);

// ── TABLE 2: tenant_billing_policy ────────────────────────────────────────
// Versioned pricing parameters controlled by AmmaWallet admin.
// LOCKED DEFAULTS — must match phase0-checklist-v3.md LOCKED DEFAULTS section.
// uq_tenant_policy_current (DEFERRABLE) is a MANUAL SQL PATCH — not in schema.
export const tenantBillingPolicy = pgTable(
  "tenant_billing_policy",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    // New wallet activation
    walletFundingEnabled: boolean("wallet_funding_enabled").notNull().default(true),
    walletFundingXlm: numeric("wallet_funding_xlm", { precision: 7, scale: 4 }).notNull().default("1.0000"),
    newWalletPlatformFeeXlm: numeric("new_wallet_platform_fee_xlm", { precision: 7, scale: 4 }).notNull().default("2.0000"),
    walletFundingMode: text("wallet_funding_mode").notNull().default("auto"),
    // Existing user onboarding — default 1.0 (NOT 0.5)
    onboardingEnabled: boolean("onboarding_enabled").notNull().default(true),
    onboardingFeeXlm: numeric("onboarding_fee_xlm", { precision: 7, scale: 4 }).notNull().default("1.0000"),
    // Monthly maintenance — enabled=true, fee=0.1 (NOT false/0.0)
    monthlyMaintenanceEnabled: boolean("monthly_maintenance_enabled").notNull().default(true),
    monthlyFeePerActiveUser: numeric("monthly_fee_per_active_user", { precision: 7, scale: 4 }).notNull().default("0.1000"),
    activityWindowDays: integer("activity_window_days").notNull().default(90),
    gracePeriodDays: integer("grace_period_days").notNull().default(14),
    // Acquisition mode — enabled by default, debt_limit=-300
    acquisitionModeEnabled: boolean("acquisition_mode_enabled").notNull().default(true),
    acquisitionDebtLimitXlm: numeric("acquisition_debt_limit_xlm", { precision: 18, scale: 7 }).notNull().default("-300.0000000"),
    // Versioning
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("seed"),
    notes: text("notes"),
  },
  (table) => [
    index("idx_billing_policy_tenant").on(table.tenantId),
    index("idx_billing_policy_current").on(table.tenantId, table.isCurrent),
    uniqueIndex("uq_tenant_policy_version").on(table.tenantId, table.version),
    check("chk_funding_mode", sql`${table.walletFundingMode} IN ('auto', 'manual', 'batch')`),
    check(
      "chk_policy_fees",
      sql`${table.walletFundingXlm} >= 0 AND ${table.newWalletPlatformFeeXlm} > 0 AND ${table.onboardingFeeXlm} >= 0 AND ${table.monthlyFeePerActiveUser} >= 0`,
    ),
    check("chk_debt_limit", sql`${table.acquisitionDebtLimitXlm} <= 0`),
    // uq_tenant_policy_current UNIQUE (tenant_id, is_current) DEFERRABLE INITIALLY DEFERRED
    // is a MANUAL SQL PATCH — Drizzle does not support DEFERRABLE constraints
  ],
);

// ── TABLE 3: tenant_api_keys ──────────────────────────────────────────────
// DB-backed API keys scoped to a tenant, hashed for security.
// scopes TEXT[] default is '{}'::text[] — verify cast in generated SQL.
export const tenantApiKeys = pgTable(
  "tenant_api_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").unique().notNull(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_tenant_api_keys_hash").on(table.keyHash),
    index("idx_tenant_api_keys_tenant").on(table.tenantId),
  ],
);

// ── TABLE 4: wallet_roles ─────────────────────────────────────────────────
// Registry of system Stellar keypair roles. Seed: exactly 4 system rows.
// public_key UNIQUE allows multiple NULLs (NULL != NULL in SQL).
export const walletRoles = pgTable(
  "wallet_roles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    roleSlug: text("role_slug").unique().notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    publicKey: text("public_key").unique(),
    network: text("network").notNull().default("public"),
    isSystem: boolean("is_system").notNull().default(false),
    tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_wallet_roles_tenant").on(table.tenantId),
    index("idx_wallet_roles_pubkey").on(table.publicKey),
  ],
);

// ── TABLE 5: funding_events ───────────────────────────────────────────────
// Immutable audit trail of every on-chain Stellar transaction.
// parentEventId is a PLAIN BIGINT — self-ref FK (DEFERRABLE) is a MANUAL SQL PATCH.
export const fundingEvents = pgTable(
  "funding_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "set null" }),
    apiKeyId: bigint("api_key_id", { mode: "number" }).references(() => tenantApiKeys.id, { onDelete: "set null" }),
    parentEventId: bigint("parent_event_id", { mode: "number" }),
    // ^ Self-referential FK added as manual SQL patch: DEFERRABLE INITIALLY DEFERRED
    callerService: text("caller_service"),
    eventType: text("event_type").notNull(),
    sourceWalletRole: text("source_wallet_role"),
    destinationAddress: text("destination_address").notNull(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    amountXlm: numeric("amount_xlm", { precision: 18, scale: 7 }),
    assetCode: text("asset_code"),
    assetIssuer: text("asset_issuer"),
    stellarTxHash: text("stellar_tx_hash"),
    purpose: text("purpose").notNull(),
    status: text("status").notNull().default("pending"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_funding_events_tenant").on(table.tenantId),
    index("idx_funding_events_user").on(table.userId),
    index("idx_funding_events_type").on(table.eventType),
    index("idx_funding_events_status").on(table.status),
    index("idx_funding_events_dest").on(table.destinationAddress),
    index("idx_funding_events_created").on(table.createdAt),
    check("chk_funding_status", sql`${table.status} IN ('pending', 'confirmed', 'failed')`),
  ],
);

// ── TABLE 6: fee_split_rules ──────────────────────────────────────────────
// Partner commission rules. Dormant in Phase 0.
// chk_shares_sum (amma_wallet_share + partner_share = 1.0000) is a MANUAL SQL PATCH.
export const feeSplitRules = pgTable(
  "fee_split_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    ammaWalletShare: numeric("amma_wallet_share", { precision: 5, scale: 4 }).notNull(),
    partnerShare: numeric("partner_share", { precision: 5, scale: 4 }).notNull().default("0"),
    partnerWalletAddress: text("partner_wallet_address"),
    flatFeeXlm: numeric("flat_fee_xlm", { precision: 18, scale: 7 }).notNull().default("0"),
    flatFeeAssetCode: text("flat_fee_asset_code").default("XLM"),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_fee_split_tenant").on(table.tenantId),
    index("idx_fee_split_active").on(table.isActive, table.effectiveFrom, table.effectiveUntil),
    check(
      "chk_fee_partner_addr",
      sql`${table.partnerShare} = 0 OR ${table.partnerWalletAddress} IS NOT NULL`,
    ),
    // chk_shares_sum CHECK (amma_wallet_share + partner_share = 1.0000) is a MANUAL SQL PATCH
  ],
);

// ── TABLE 7: tenant_members ───────────────────────────────────────────────
// Links AmmaWallet user accounts to tenant organizations (dashboard access).
export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tenant_member").on(table.tenantId, table.userId),
    index("idx_tenant_members_tenant").on(table.tenantId),
    index("idx_tenant_members_user").on(table.userId),
    check("chk_member_role", sql`${table.role} IN ('owner', 'admin', 'viewer')`),
  ],
);

// ── TABLE 8: tenant_users ─────────────────────────────────────────────────
// Records which end-users were introduced to AmmaWallet by which tenant.
export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    registeredVia: text("registered_via").notNull().default("sso"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tenant_user").on(table.tenantId, table.userId),
    index("idx_tenant_users_tenant").on(table.tenantId),
    index("idx_tenant_users_user").on(table.userId),
  ],
);

// ── TABLE 9: tenant_alert_log ─────────────────────────────────────────────
// Deduplication record for sent notifications.
export const tenantAlertLog = pgTable(
  "tenant_alert_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    threshold: numeric("threshold", { precision: 18, scale: 7 }),
    sentTo: text("sent_to"),
    delivered: boolean("delivered").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_alert_log_tenant").on(table.tenantId),
    index("idx_alert_log_type").on(table.alertType, table.createdAt),
    check(
      "chk_alert_type",
      sql`${table.alertType} IN ('low_balance','balance_negative','deficit_deepened','zero_balance_block','maintenance_grace_start','maintenance_grace_3day','maintenance_grace_expired','balance_restored','referral_reward_held','unallocated_deposit','manual_suspension')`,
    ),
  ],
);

// ── TABLE 10: referral_campaigns ──────────────────────────────────────────
// Campaign-level configuration for referral programs.
// Compound reward checks (chk_tenant_reward_data, chk_amma_bonus_data) are MANUAL SQL PATCHES.
export const referralCampaigns = pgTable(
  "referral_campaigns",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").unique().notNull(),
    name: text("name").notNull(),
    description: text("description"),
    campaignType: text("campaign_type").notNull().default("tenant"),
    isActive: boolean("is_active").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    // Tenant-funded reward
    tenantRewardEnabled: boolean("tenant_reward_enabled").notNull().default(false),
    tenantRewardType: text("tenant_reward_type"),
    tenantRewardXlm: numeric("tenant_reward_xlm", { precision: 7, scale: 4 }),
    tenantRewardPercentage: numeric("tenant_reward_percentage", { precision: 5, scale: 4 }),
    // AmmaWallet-funded bonus
    ammaBonusEnabled: boolean("amma_bonus_enabled").notNull().default(false),
    ammaBonusXlm: numeric("amma_bonus_xlm", { precision: 7, scale: 4 }),
    // Eligibility
    applyToNewWalletsOnly: boolean("apply_to_new_wallets_only").notNull().default(false),
    minActivityRequirement: text("min_activity_requirement").notNull().default("first_login"),
    // Abuse controls
    holdDays: integer("hold_days").notNull().default(14),
    expiryDays: integer("expiry_days").notNull().default(90),
    monthlyCapPerReferrer: integer("monthly_cap_per_referrer"),
    maxTotalPayouts: integer("max_total_payouts"),
    // Code model
    codeModel: text("code_model").notNull().default("user_generated"),
    maxUsesPerCode: integer("max_uses_per_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("admin"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_campaigns_tenant").on(table.tenantId),
    index("idx_campaigns_active").on(table.isActive, table.endsAt),
    check("chk_campaign_type", sql`${table.campaignType} IN ('personal', 'tenant', 'dual')`),
    check("chk_activity_req", sql`${table.minActivityRequirement} IN ('first_login', 'none')`),
    check("chk_code_model", sql`${table.codeModel} IN ('user_generated', 'single_tenant', 'admin_issued')`),
    check(
      "chk_tenant_reward_type",
      sql`${table.tenantRewardType} IS NULL OR ${table.tenantRewardType} IN ('fixed_xlm', 'fee_percentage')`,
    ),
    // chk_tenant_reward_data and chk_amma_bonus_data are MANUAL SQL PATCHES (compound conditions)
  ],
);

// ── TABLE 11: referral_codes ──────────────────────────────────────────────
// Personal user referral codes (platform-wide). Distinct from tenant campaign codes.
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    campaignId: bigint("campaign_id", { mode: "number" }).references(() => referralCampaigns.id, { onDelete: "set null" }),
    code: text("code").unique().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    usesCount: integer("uses_count").notNull().default(0),
    maxUses: integer("max_uses"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_referral_codes_user").on(table.userId),
    index("idx_referral_codes_campaign").on(table.campaignId),
  ],
);

// ── TABLE 12: tenant_referral_codes ──────────────────────────────────────
// Campaign-level codes issued for tenant referral campaigns.
export const tenantReferralCodes = pgTable(
  "tenant_referral_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: bigint("campaign_id", { mode: "number" }).notNull().references(() => referralCampaigns.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    code: text("code").unique().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    usesCount: integer("uses_count").notNull().default(0),
    maxUses: integer("max_uses"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("admin"),
  },
  (table) => [
    index("idx_tenant_ref_codes_tenant").on(table.tenantId),
    index("idx_tenant_ref_codes_campaign").on(table.campaignId),
    index("idx_tenant_ref_codes_user").on(table.userId),
  ],
);

// ── TABLE 13: internal_admins ─────────────────────────────────────────────
// AmmaWallet staff identity — fully separate from users table.
// createdBy is a PLAIN BIGINT — self-ref FK is a MANUAL SQL PATCH.
// EMPTY in Phase 0 — first super_admin bootstrapped at Phase 3.
export const internalAdmins = pgTable(
  "internal_admins",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").unique().notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: bigint("created_by", { mode: "number" }),
    // ^ Self-referential FK added as manual SQL patch
  },
  (table) => [
    uniqueIndex("idx_internal_admins_email").on(table.email),
    index("idx_internal_admins_role").on(table.role),
    check(
      "chk_admin_role",
      sql`${table.role} IN ('super_admin', 'platform_admin', 'account_manager', 'support_agent')`,
    ),
  ],
);

// ── TABLE 14: admin_tenant_assignments ────────────────────────────────────
// Scopes account_manager and support_agent to specific tenants.
export const adminTenantAssignments = pgTable(
  "admin_tenant_assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminId: bigint("admin_id", { mode: "number" }).notNull().references(() => internalAdmins.id, { onDelete: "cascade" }),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    notes: text("notes"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: bigint("assigned_by", { mode: "number" }).references(() => internalAdmins.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("uq_admin_tenant").on(table.adminId, table.tenantId),
    index("idx_admin_tenant_admin").on(table.adminId),
    index("idx_admin_tenant_tenant").on(table.tenantId),
  ],
);

// ── TABLE 15: bundle_catalog ──────────────────────────────────────────────
// Named commercial tiers available for tenant purchase.
// price_xlm is NULLABLE — custom bundle has no fixed price.
export const bundleCatalog = pgTable("bundle_catalog", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  approxUsers: integer("approx_users"),
  priceXlm: numeric("price_xlm", { precision: 18, scale: 7 }),
  // NULL for 'custom' bundle — price is set at purchase time
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── TABLE 16: tenant_bundle_purchases ─────────────────────────────────────
// Immutable commercial record of each bundle purchase.
// billingEventId references billingEvents — Drizzle generates FK as ALTER TABLE (safe).
export const tenantBundlePurchases = pgTable(
  "tenant_bundle_purchases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    bundleId: bigint("bundle_id", { mode: "number" }).references(() => bundleCatalog.id, { onDelete: "set null" }),
    bundleSlugSnapshot: text("bundle_slug_snapshot").notNull(),
    bundleNameSnapshot: text("bundle_name_snapshot").notNull(),
    amountXlm: numeric("amount_xlm", { precision: 18, scale: 7 }).notNull(),
    approxUsersSnapshot: integer("approx_users_snapshot"),
    billingEventId: bigint("billing_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    notes: text("notes"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: bigint("recorded_by", { mode: "number" }).references(() => internalAdmins.id, { onDelete: "set null" }),
    paymentReference: text("payment_reference"),
  },
  (table) => [
    index("idx_bundle_purchases_tenant").on(table.tenantId),
    index("idx_bundle_purchases_bundle").on(table.bundleId),
  ],
);

// ── TABLE 17: unallocated_deposits ────────────────────────────────────────
// Holds XLM receipts without a linked bundle selection. Admin allocates manually.
export const unallocatedDeposits = pgTable(
  "unallocated_deposits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceDescription: text("source_description").notNull(),
    amountXlm: numeric("amount_xlm", { precision: 18, scale: 7 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    stellarTxHash: text("stellar_tx_hash"),
    sourceAddress: text("source_address"),
    notes: text("notes"),
    isAllocated: boolean("is_allocated").notNull().default(false),
    allocatedToBillingEventId: bigint("allocated_to_billing_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }),
    allocatedBy: bigint("allocated_by", { mode: "number" }).references(() => internalAdmins.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_unallocated_pending").on(table.isAllocated),
  ],
);

// ── TABLE 18: billing_events ──────────────────────────────────────────────
// Unified append-only XLM charge ledger for all billable events.
// HIGH RISK: event_type CHECK must be complete and correct.
// referralId is a PLAIN BIGINT — circular FK is a MANUAL SQL PATCH (added after referrals exists).
export const billingEvents = pgTable(
  "billing_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    amountXlm: numeric("amount_xlm", { precision: 18, scale: 7 }).notNull(),
    policyVersionId: bigint("policy_version_id", { mode: "number" }).references(() => tenantBillingPolicy.id, { onDelete: "set null" }),
    // new_wallet_activation snapshots
    walletFundingSnapshot: numeric("wallet_funding_snapshot", { precision: 7, scale: 4 }),
    platformFeeSnapshot: numeric("platform_fee_snapshot", { precision: 7, scale: 4 }),
    // existing_user_onboarding snapshots
    onboardingFeeSnapshot: numeric("onboarding_fee_snapshot", { precision: 7, scale: 4 }),
    // monthly_maintenance_charge snapshots
    billingPeriod: text("billing_period"),
    activeUserCountSnapshot: integer("active_user_count_snapshot"),
    feePerUserSnapshot: numeric("fee_per_user_snapshot", { precision: 7, scale: 4 }),
    // tenant_referral_reward
    referralId: bigint("referral_id", { mode: "number" }),
    // ^ NO .references() — circular FK added as manual SQL patch after referrals table exists
    tenantRewardSnapshot: numeric("tenant_reward_snapshot", { precision: 7, scale: 4 }),
    // Related entities
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    apiKeyId: bigint("api_key_id", { mode: "number" }).references(() => tenantApiKeys.id, { onDelete: "set null" }),
    fundingEventId: bigint("funding_event_id", { mode: "number" }).references(() => fundingEvents.id, { onDelete: "set null" }),
    // Bundle and deposit FKs
    bundlePurchaseId: bigint("bundle_purchase_id", { mode: "number" }).references(() => tenantBundlePurchases.id, { onDelete: "set null" }),
    unallocatedDepositId: bigint("unallocated_deposit_id", { mode: "number" }).references(() => unallocatedDeposits.id, { onDelete: "set null" }),
    // Audit
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_billing_events_tenant").on(table.tenantId),
    index("idx_billing_events_type").on(table.eventType),
    index("idx_billing_events_user").on(table.userId),
    index("idx_billing_events_period").on(table.billingPeriod),
    index("idx_billing_events_created").on(table.createdAt),
    check(
      "chk_billing_event_type",
      sql`${table.eventType} IN ('bundle_purchase','manual_topup','manual_adjustment','unallocated_deposit_allocated','stellar_tx_refund','new_wallet_activation','existing_user_onboarding','monthly_maintenance_charge','tenant_referral_reward')`,
    ),
    check("chk_billing_amount_nonzero", sql`${table.amountXlm} <> 0`),
  ],
);

// ── TABLE 19: referrals ───────────────────────────────────────────────────
// Tracks individual referral relationships through the full state machine.
// HIGH RISK: uq_referral_referred enforces lifetime one-referral-per-user.
// chk_ref_status, chk_code_attribution, chk_triggered_event_type are MANUAL SQL PATCHES.
export const referrals = pgTable(
  "referrals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    referrerId: bigint("referrer_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    referredId: bigint("referred_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "set null" }),
    campaignId: bigint("campaign_id", { mode: "number" }).references(() => referralCampaigns.id, { onDelete: "set null" }),
    personalCodeId: bigint("personal_code_id", { mode: "number" }).references(() => referralCodes.id, { onDelete: "set null" }),
    tenantCodeId: bigint("tenant_code_id", { mode: "number" }).references(() => tenantReferralCodes.id, { onDelete: "set null" }),
    triggeredByEventType: text("triggered_by_event_type").notNull(),
    triggeredByBillingEventId: bigint("triggered_by_billing_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    // Pricing snapshots
    tenantRewardTypeSnapshot: text("tenant_reward_type_snapshot"),
    tenantRewardXlmSnapshot: numeric("tenant_reward_xlm_snapshot", { precision: 7, scale: 4 }),
    ammaBonusXlmSnapshot: numeric("amma_bonus_xlm_snapshot", { precision: 7, scale: 4 }),
    // Tenant-funded payout tracking
    tenantRewardPaidAt: timestamp("tenant_reward_paid_at", { withTimezone: true }),
    tenantRewardTxHash: text("tenant_reward_tx_hash"),
    tenantRewardFundingEventId: bigint("tenant_reward_funding_event_id", { mode: "number" }).references(() => fundingEvents.id, { onDelete: "set null" }),
    tenantRewardBillingEventId: bigint("tenant_reward_billing_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    // AmmaWallet-funded bonus tracking
    ammaBonusPaidAt: timestamp("amma_bonus_paid_at", { withTimezone: true }),
    ammaBonusTxHash: text("amma_bonus_tx_hash"),
    ammaBonusFundingEventId: bigint("amma_bonus_funding_event_id", { mode: "number" }).references(() => fundingEvents.id, { onDelete: "set null" }),
    // Timing
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    activityMetAt: timestamp("activity_met_at", { withTimezone: true }),
    holdUntil: timestamp("hold_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // Abuse flags
    sameIpFlag: boolean("same_ip_flag").notNull().default(false),
    rapidRegistrationFlag: boolean("rapid_registration_flag").notNull().default(false),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewResolvedAt: timestamp("review_resolved_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_referral_referred").on(table.referredId),
    index("idx_referrals_referrer").on(table.referrerId),
    index("idx_referrals_referred").on(table.referredId),
    index("idx_referrals_campaign").on(table.campaignId),
    index("idx_referrals_status").on(table.status),
    index("idx_referrals_hold").on(table.holdUntil),
    index("idx_referrals_approved").on(table.status),
    check("chk_no_self_referral", sql`${table.referrerId} <> ${table.referredId}`),
    // chk_ref_status, chk_code_attribution, chk_triggered_event_type are MANUAL SQL PATCHES
  ],
);

// ── TABLE 20: provisioning_queue ──────────────────────────────────────────
// Holds wallet activation requests that cannot proceed immediately.
export const provisioningQueue = pgTable(
  "provisioning_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    publicKey: text("public_key").notNull(),
    apiKeyId: bigint("api_key_id", { mode: "number" }).references(() => tenantApiKeys.id, { onDelete: "set null" }),
    callerService: text("caller_service"),
    status: text("status").notNull().default("pending_funds"),
    priority: integer("priority").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    creditEventId: bigint("credit_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    fundingEventId: bigint("funding_event_id", { mode: "number" }).references(() => fundingEvents.id, { onDelete: "set null" }),
    errorDetail: text("error_detail"),
  },
  (table) => [
    index("idx_prov_queue_tenant").on(table.tenantId, table.status),
    index("idx_prov_queue_pending").on(table.status),
    index("idx_prov_queue_expires").on(table.expiresAt),
    check(
      "chk_queue_status",
      sql`${table.status} IN ('pending_tenant_approval','pending_funds','processing','funded','failed','expired')`,
    ),
  ],
);

// ── TABLE 21: monthly_maintenance_snapshots ───────────────────────────────
// Immutable record of each monthly billing run per tenant.
export const monthlyMaintenanceSnapshots = pgTable(
  "monthly_maintenance_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    billingPeriod: text("billing_period").notNull(),
    activeUserCount: integer("active_user_count").notNull(),
    feePerUserXlm: numeric("fee_per_user_xlm", { precision: 7, scale: 4 }).notNull(),
    totalChargedXlm: numeric("total_charged_xlm", { precision: 18, scale: 7 }).notNull(),
    billingEventId: bigint("billing_event_id", { mode: "number" }).references(() => billingEvents.id, { onDelete: "set null" }),
    activityWindowDays: integer("activity_window_days").notNull().default(90),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_maintenance_snapshot").on(table.tenantId, table.billingPeriod),
    index("idx_maint_snapshots_tenant").on(table.tenantId),
    index("idx_maint_snapshots_period").on(table.billingPeriod),
  ],
);

// ── TABLE 22: system_config ───────────────────────────────────────────────
// Platform-wide operational settings. Seed: exactly 5 rows (no referral config).
export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});
