CREATE TABLE "admin_tenant_assignments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" bigint NOT NULL,
	"tenant_id" bigint NOT NULL,
	"notes" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" bigint
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"amount_xlm" numeric(18, 7) NOT NULL,
	"policy_version_id" bigint,
	"wallet_funding_snapshot" numeric(7, 4),
	"platform_fee_snapshot" numeric(7, 4),
	"onboarding_fee_snapshot" numeric(7, 4),
	"billing_period" text,
	"active_user_count_snapshot" integer,
	"fee_per_user_snapshot" numeric(7, 4),
	"referral_id" bigint,
	"tenant_reward_snapshot" numeric(7, 4),
	"user_id" bigint,
	"api_key_id" bigint,
	"funding_event_id" bigint,
	"bundle_purchase_id" bigint,
	"unallocated_deposit_id" bigint,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_billing_event_type" CHECK ("billing_events"."event_type" IN ('bundle_purchase','manual_topup','manual_adjustment','unallocated_deposit_allocated','stellar_tx_refund','new_wallet_activation','existing_user_onboarding','monthly_maintenance_charge','tenant_referral_reward')),
	CONSTRAINT "chk_billing_amount_nonzero" CHECK ("billing_events"."amount_xlm" <> 0)
);
--> statement-breakpoint
CREATE TABLE "bundle_catalog" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"approx_users" integer,
	"price_xlm" numeric(18, 7),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fee_split_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"rule_type" text NOT NULL,
	"amma_wallet_share" numeric(5, 4) NOT NULL,
	"partner_share" numeric(5, 4) DEFAULT '0' NOT NULL,
	"partner_wallet_address" text,
	"flat_fee_xlm" numeric(18, 7) DEFAULT '0' NOT NULL,
	"flat_fee_asset_code" text DEFAULT 'XLM',
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_fee_partner_addr" CHECK ("fee_split_rules"."partner_share" = 0 OR "fee_split_rules"."partner_wallet_address" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "funding_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint,
	"api_key_id" bigint,
	"parent_event_id" bigint,
	"caller_service" text,
	"event_type" text NOT NULL,
	"source_wallet_role" text,
	"destination_address" text NOT NULL,
	"user_id" bigint,
	"amount_xlm" numeric(18, 7),
	"asset_code" text,
	"asset_issuer" text,
	"stellar_tx_hash" text,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "chk_funding_status" CHECK ("funding_events"."status" IN ('pending', 'confirmed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "internal_admins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	CONSTRAINT "internal_admins_email_unique" UNIQUE("email"),
	CONSTRAINT "chk_admin_role" CHECK ("internal_admins"."role" IN ('super_admin', 'platform_admin', 'account_manager', 'support_agent'))
);
--> statement-breakpoint
CREATE TABLE "monthly_maintenance_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"billing_period" text NOT NULL,
	"active_user_count" integer NOT NULL,
	"fee_per_user_xlm" numeric(7, 4) NOT NULL,
	"total_charged_xlm" numeric(18, 7) NOT NULL,
	"billing_event_id" bigint,
	"activity_window_days" integer DEFAULT 90 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provisioning_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint,
	"public_key" text NOT NULL,
	"api_key_id" bigint,
	"caller_service" text,
	"status" text DEFAULT 'pending_funds' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" bigint,
	"credit_event_id" bigint,
	"funding_event_id" bigint,
	"error_detail" text,
	CONSTRAINT "chk_queue_status" CHECK ("provisioning_queue"."status" IN ('pending_tenant_approval','pending_funds','processing','funded','failed','expired'))
);
--> statement-breakpoint
CREATE TABLE "referral_campaigns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"campaign_type" text DEFAULT 'tenant' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"tenant_reward_enabled" boolean DEFAULT false NOT NULL,
	"tenant_reward_type" text,
	"tenant_reward_xlm" numeric(7, 4),
	"tenant_reward_percentage" numeric(5, 4),
	"amma_bonus_enabled" boolean DEFAULT false NOT NULL,
	"amma_bonus_xlm" numeric(7, 4),
	"apply_to_new_wallets_only" boolean DEFAULT false NOT NULL,
	"min_activity_requirement" text DEFAULT 'first_login' NOT NULL,
	"hold_days" integer DEFAULT 14 NOT NULL,
	"expiry_days" integer DEFAULT 90 NOT NULL,
	"monthly_cap_per_referrer" integer,
	"max_total_payouts" integer,
	"code_model" text DEFAULT 'user_generated' NOT NULL,
	"max_uses_per_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'admin' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_campaigns_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chk_campaign_type" CHECK ("referral_campaigns"."campaign_type" IN ('personal', 'tenant', 'dual')),
	CONSTRAINT "chk_activity_req" CHECK ("referral_campaigns"."min_activity_requirement" IN ('first_login', 'none')),
	CONSTRAINT "chk_code_model" CHECK ("referral_campaigns"."code_model" IN ('user_generated', 'single_tenant', 'admin_issued')),
	CONSTRAINT "chk_tenant_reward_type" CHECK ("referral_campaigns"."tenant_reward_type" IS NULL OR "referral_campaigns"."tenant_reward_type" IN ('fixed_xlm', 'fee_percentage'))
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" bigint,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"referrer_id" bigint NOT NULL,
	"referred_id" bigint NOT NULL,
	"tenant_id" bigint,
	"campaign_id" bigint,
	"personal_code_id" bigint,
	"tenant_code_id" bigint,
	"triggered_by_event_type" text NOT NULL,
	"triggered_by_billing_event_id" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_reward_type_snapshot" text,
	"tenant_reward_xlm_snapshot" numeric(7, 4),
	"amma_bonus_xlm_snapshot" numeric(7, 4),
	"tenant_reward_paid_at" timestamp with time zone,
	"tenant_reward_tx_hash" text,
	"tenant_reward_funding_event_id" bigint,
	"tenant_reward_billing_event_id" bigint,
	"amma_bonus_paid_at" timestamp with time zone,
	"amma_bonus_tx_hash" text,
	"amma_bonus_funding_event_id" bigint,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activity_met_at" timestamp with time zone,
	"hold_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"same_ip_flag" boolean DEFAULT false NOT NULL,
	"rapid_registration_flag" boolean DEFAULT false NOT NULL,
	"review_required" boolean DEFAULT false NOT NULL,
	"review_resolved_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_no_self_referral" CHECK ("referrals"."referrer_id" <> "referrals"."referred_id")
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "tenant_alert_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"alert_type" text NOT NULL,
	"threshold" numeric(18, 7),
	"sent_to" text,
	"delivered" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_alert_type" CHECK ("tenant_alert_log"."alert_type" IN ('low_balance','balance_negative','deficit_deepened','zero_balance_block','maintenance_grace_start','maintenance_grace_3day','maintenance_grace_expired','balance_restored','referral_reward_held','unallocated_deposit','manual_suspension'))
);
--> statement-breakpoint
CREATE TABLE "tenant_api_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "tenant_billing_policy" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"wallet_funding_enabled" boolean DEFAULT true NOT NULL,
	"wallet_funding_xlm" numeric(7, 4) DEFAULT '1.0000' NOT NULL,
	"new_wallet_platform_fee_xlm" numeric(7, 4) DEFAULT '2.0000' NOT NULL,
	"wallet_funding_mode" text DEFAULT 'auto' NOT NULL,
	"onboarding_enabled" boolean DEFAULT true NOT NULL,
	"onboarding_fee_xlm" numeric(7, 4) DEFAULT '1.0000' NOT NULL,
	"monthly_maintenance_enabled" boolean DEFAULT true NOT NULL,
	"monthly_fee_per_active_user" numeric(7, 4) DEFAULT '0.1000' NOT NULL,
	"activity_window_days" integer DEFAULT 90 NOT NULL,
	"grace_period_days" integer DEFAULT 14 NOT NULL,
	"acquisition_mode_enabled" boolean DEFAULT true NOT NULL,
	"acquisition_debt_limit_xlm" numeric(18, 7) DEFAULT '-300.0000000' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'seed' NOT NULL,
	"notes" text,
	CONSTRAINT "chk_funding_mode" CHECK ("tenant_billing_policy"."wallet_funding_mode" IN ('auto', 'manual', 'batch')),
	CONSTRAINT "chk_policy_fees" CHECK ("tenant_billing_policy"."wallet_funding_xlm" >= 0 AND "tenant_billing_policy"."new_wallet_platform_fee_xlm" > 0 AND "tenant_billing_policy"."onboarding_fee_xlm" >= 0 AND "tenant_billing_policy"."monthly_fee_per_active_user" >= 0),
	CONSTRAINT "chk_debt_limit" CHECK ("tenant_billing_policy"."acquisition_debt_limit_xlm" <= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_bundle_purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"bundle_id" bigint,
	"bundle_slug_snapshot" text NOT NULL,
	"bundle_name_snapshot" text NOT NULL,
	"amount_xlm" numeric(18, 7) NOT NULL,
	"approx_users_snapshot" integer,
	"billing_event_id" bigint,
	"notes" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" bigint,
	"payment_reference" text
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_member_role" CHECK ("tenant_members"."role" IN ('owner', 'admin', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "tenant_referral_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"campaign_id" bigint NOT NULL,
	"user_id" bigint,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'admin' NOT NULL,
	CONSTRAINT "tenant_referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"registered_via" text DEFAULT 'sso' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"prepaid_xlm_balance" numeric(18, 7) DEFAULT '0' NOT NULL,
	"low_balance_threshold_xlm" numeric(18, 7) DEFAULT '300.0000000' NOT NULL,
	"webhook_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"allow_provisioning_queue" boolean DEFAULT false NOT NULL,
	"queue_max_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chk_suspension_reason" CHECK ("tenants"."suspension_reason" IS NULL OR "tenants"."suspension_reason" IN ('debt_limit', 'maintenance_grace_expired', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "unallocated_deposits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_description" text NOT NULL,
	"amount_xlm" numeric(18, 7) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stellar_tx_hash" text,
	"source_address" text,
	"notes" text,
	"is_allocated" boolean DEFAULT false NOT NULL,
	"allocated_to_billing_event_id" bigint,
	"allocated_at" timestamp with time zone,
	"allocated_by" bigint
);
--> statement-breakpoint
CREATE TABLE "wallet_roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role_slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"public_key" text,
	"network" text DEFAULT 'public' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"tenant_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_roles_role_slug_unique" UNIQUE("role_slug"),
	CONSTRAINT "wallet_roles_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
ALTER TABLE "admin_tenant_assignments" ADD CONSTRAINT "admin_tenant_assignments_admin_id_internal_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."internal_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tenant_assignments" ADD CONSTRAINT "admin_tenant_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tenant_assignments" ADD CONSTRAINT "admin_tenant_assignments_assigned_by_internal_admins_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."internal_admins"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_policy_version_id_tenant_billing_policy_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."tenant_billing_policy"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_api_key_id_tenant_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."tenant_api_keys"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_funding_event_id_funding_events_id_fk" FOREIGN KEY ("funding_event_id") REFERENCES "public"."funding_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_bundle_purchase_id_tenant_bundle_purchases_id_fk" FOREIGN KEY ("bundle_purchase_id") REFERENCES "public"."tenant_bundle_purchases"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_unallocated_deposit_id_unallocated_deposits_id_fk" FOREIGN KEY ("unallocated_deposit_id") REFERENCES "public"."unallocated_deposits"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_split_rules" ADD CONSTRAINT "fee_split_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_api_key_id_tenant_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."tenant_api_keys"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_maintenance_snapshots" ADD CONSTRAINT "monthly_maintenance_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_maintenance_snapshots" ADD CONSTRAINT "monthly_maintenance_snapshots_billing_event_id_billing_events_id_fk" FOREIGN KEY ("billing_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_api_key_id_tenant_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."tenant_api_keys"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_credit_event_id_billing_events_id_fk" FOREIGN KEY ("credit_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_queue" ADD CONSTRAINT "provisioning_queue_funding_event_id_funding_events_id_fk" FOREIGN KEY ("funding_event_id") REFERENCES "public"."funding_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_campaigns" ADD CONSTRAINT "referral_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_campaign_id_referral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaigns"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_campaign_id_referral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaigns"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_personal_code_id_referral_codes_id_fk" FOREIGN KEY ("personal_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_code_id_tenant_referral_codes_id_fk" FOREIGN KEY ("tenant_code_id") REFERENCES "public"."tenant_referral_codes"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_triggered_by_billing_event_id_billing_events_id_fk" FOREIGN KEY ("triggered_by_billing_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_reward_funding_event_id_funding_events_id_fk" FOREIGN KEY ("tenant_reward_funding_event_id") REFERENCES "public"."funding_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_reward_billing_event_id_billing_events_id_fk" FOREIGN KEY ("tenant_reward_billing_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_amma_bonus_funding_event_id_funding_events_id_fk" FOREIGN KEY ("amma_bonus_funding_event_id") REFERENCES "public"."funding_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_alert_log" ADD CONSTRAINT "tenant_alert_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_billing_policy" ADD CONSTRAINT "tenant_billing_policy_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bundle_purchases" ADD CONSTRAINT "tenant_bundle_purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bundle_purchases" ADD CONSTRAINT "tenant_bundle_purchases_bundle_id_bundle_catalog_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle_catalog"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bundle_purchases" ADD CONSTRAINT "tenant_bundle_purchases_billing_event_id_billing_events_id_fk" FOREIGN KEY ("billing_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bundle_purchases" ADD CONSTRAINT "tenant_bundle_purchases_recorded_by_internal_admins_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."internal_admins"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_referral_codes" ADD CONSTRAINT "tenant_referral_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_referral_codes" ADD CONSTRAINT "tenant_referral_codes_campaign_id_referral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_referral_codes" ADD CONSTRAINT "tenant_referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unallocated_deposits" ADD CONSTRAINT "unallocated_deposits_allocated_to_billing_event_id_billing_events_id_fk" FOREIGN KEY ("allocated_to_billing_event_id") REFERENCES "public"."billing_events"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unallocated_deposits" ADD CONSTRAINT "unallocated_deposits_allocated_by_internal_admins_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."internal_admins"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_roles" ADD CONSTRAINT "wallet_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admin_tenant" ON "admin_tenant_assignments" USING btree ("admin_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_admin_tenant_admin" ON "admin_tenant_assignments" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_admin_tenant_tenant" ON "admin_tenant_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_billing_events_tenant" ON "billing_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_billing_events_type" ON "billing_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_billing_events_user" ON "billing_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_billing_events_period" ON "billing_events" USING btree ("billing_period");--> statement-breakpoint
CREATE INDEX "idx_billing_events_created" ON "billing_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_fee_split_tenant" ON "fee_split_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_fee_split_active" ON "fee_split_rules" USING btree ("is_active","effective_from","effective_until");--> statement-breakpoint
CREATE INDEX "idx_funding_events_tenant" ON "funding_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_funding_events_user" ON "funding_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_funding_events_type" ON "funding_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_funding_events_status" ON "funding_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_funding_events_dest" ON "funding_events" USING btree ("destination_address");--> statement-breakpoint
CREATE INDEX "idx_funding_events_created" ON "funding_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_internal_admins_email" ON "internal_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_internal_admins_role" ON "internal_admins" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_maintenance_snapshot" ON "monthly_maintenance_snapshots" USING btree ("tenant_id","billing_period");--> statement-breakpoint
CREATE INDEX "idx_maint_snapshots_tenant" ON "monthly_maintenance_snapshots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_maint_snapshots_period" ON "monthly_maintenance_snapshots" USING btree ("billing_period");--> statement-breakpoint
CREATE INDEX "idx_prov_queue_tenant" ON "provisioning_queue" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_prov_queue_pending" ON "provisioning_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_prov_queue_expires" ON "provisioning_queue" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_campaigns_tenant" ON "referral_campaigns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_active" ON "referral_campaigns" USING btree ("is_active","ends_at");--> statement-breakpoint
CREATE INDEX "idx_referral_codes_user" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_referral_codes_campaign" ON "referral_codes" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_referral_referred" ON "referrals" USING btree ("referred_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referred" ON "referrals" USING btree ("referred_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_campaign" ON "referrals" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_status" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_referrals_hold" ON "referrals" USING btree ("hold_until");--> statement-breakpoint
CREATE INDEX "idx_referrals_approved" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_alert_log_tenant" ON "tenant_alert_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_alert_log_type" ON "tenant_alert_log" USING btree ("alert_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_tenant_api_keys_hash" ON "tenant_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_tenant_api_keys_tenant" ON "tenant_api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_billing_policy_tenant" ON "tenant_billing_policy" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_billing_policy_current" ON "tenant_billing_policy" USING btree ("tenant_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_policy_version" ON "tenant_billing_policy" USING btree ("tenant_id","version");--> statement-breakpoint
CREATE INDEX "idx_bundle_purchases_tenant" ON "tenant_bundle_purchases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_bundle_purchases_bundle" ON "tenant_bundle_purchases" USING btree ("bundle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_member" ON "tenant_members" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_members_tenant" ON "tenant_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_members_user" ON "tenant_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_ref_codes_tenant" ON "tenant_referral_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_ref_codes_campaign" ON "tenant_referral_codes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_ref_codes_user" ON "tenant_referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_user" ON "tenant_users" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_users_tenant" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_users_user" ON "tenant_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tenants_balance" ON "tenants" USING btree ("prepaid_xlm_balance");--> statement-breakpoint
CREATE INDEX "idx_tenants_active" ON "tenants" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_unallocated_pending" ON "unallocated_deposits" USING btree ("is_allocated");--> statement-breakpoint
CREATE INDEX "idx_wallet_roles_tenant" ON "wallet_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_wallet_roles_pubkey" ON "wallet_roles" USING btree ("public_key");
--> statement-breakpoint
-- =============================================================================
-- MANUAL SQL PATCHES: constraints drizzle-kit cannot generate
-- Source: phase0-checklist-v3.md COMPLETE MANUAL SQL PATCHES section
-- Added: 2026-07-17
-- =============================================================================

-- 1. funding_events self-referential FK (DEFERRABLE INITIALLY DEFERRED)
--    Drizzle cannot generate self-referential FKs with DEFERRABLE attribute.
ALTER TABLE "funding_events"
  ADD CONSTRAINT "fk_funding_events_parent"
  FOREIGN KEY ("parent_event_id") REFERENCES "funding_events"("id")
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- 2. tenant_billing_policy DEFERRABLE UNIQUE on (tenant_id, is_current)
--    Drizzle does not support DEFERRABLE constraints.
--    Required for atomic policy version swaps within a single transaction.
ALTER TABLE "tenant_billing_policy"
  ADD CONSTRAINT "uq_tenant_policy_current"
  UNIQUE ("tenant_id", "is_current")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- 3. fee_split_rules share sum check
--    Drizzle does not generate arithmetic expression CHECKs.
ALTER TABLE "fee_split_rules"
  ADD CONSTRAINT "chk_shares_sum"
  CHECK ("amma_wallet_share" + "partner_share" = 1.0000);
--> statement-breakpoint

-- 4a. referral_campaigns tenant reward compound check
ALTER TABLE "referral_campaigns"
  ADD CONSTRAINT "chk_tenant_reward_data"
  CHECK (
    NOT "tenant_reward_enabled" OR (
      ("tenant_reward_type" = 'fixed_xlm'      AND "tenant_reward_xlm" > 0) OR
      ("tenant_reward_type" = 'fee_percentage' AND "tenant_reward_percentage" > 0
        AND "tenant_reward_percentage" <= 1.0000)
    )
  );
--> statement-breakpoint

-- 4b. referral_campaigns amma bonus compound check
ALTER TABLE "referral_campaigns"
  ADD CONSTRAINT "chk_amma_bonus_data"
  CHECK (NOT "amma_bonus_enabled" OR "amma_bonus_xlm" > 0);
--> statement-breakpoint

-- 5a. referrals status state machine
ALTER TABLE "referrals"
  ADD CONSTRAINT "chk_ref_status"
  CHECK ("status" IN (
    'pending','activity_met','hold','review','approved',
    'approved_pending_tenant_funds','partial_paid','paid','rejected','expired'
  ));
--> statement-breakpoint

-- 5b. referrals code attribution: at least one code must be set
ALTER TABLE "referrals"
  ADD CONSTRAINT "chk_code_attribution"
  CHECK ("personal_code_id" IS NOT NULL OR "tenant_code_id" IS NOT NULL);
--> statement-breakpoint

-- 5c. referrals triggered event type
ALTER TABLE "referrals"
  ADD CONSTRAINT "chk_triggered_event_type"
  CHECK ("triggered_by_event_type" IN ('new_wallet_activation','existing_user_onboarding'));
--> statement-breakpoint

-- 6. internal_admins self-referential FK
--    Drizzle cannot generate self-referential FKs.
ALTER TABLE "internal_admins"
  ADD CONSTRAINT "fk_internal_admins_created_by"
  FOREIGN KEY ("created_by") REFERENCES "internal_admins"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- 7. billing_events -> referrals circular FK
--    Added AFTER both tables exist. referral_id column has no .references() in schema.
ALTER TABLE "billing_events"
  ADD CONSTRAINT "fk_billing_events_referral"
  FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE SET NULL;
