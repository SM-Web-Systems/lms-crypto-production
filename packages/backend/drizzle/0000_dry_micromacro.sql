CREATE TABLE "contract_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_type" text NOT NULL,
	"asset_code" text,
	"asset_issuer" text,
	"name" text,
	"symbol" text,
	"decimals" smallint DEFAULT 7 NOT NULL,
	"token_id" bigint,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "liquidity_pools" (
	"pool_id" text PRIMARY KEY NOT NULL,
	"asset_a_code" text NOT NULL,
	"asset_a_issuer" text,
	"asset_b_code" text NOT NULL,
	"asset_b_issuer" text,
	"fee_bp" integer DEFAULT 30,
	"reserve_a" numeric,
	"reserve_b" numeric,
	"total_shares" numeric,
	"total_trustlines" integer,
	"spot_price" numeric,
	"volume_24h" numeric DEFAULT '0',
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_type" text NOT NULL,
	"asset_code" text,
	"asset_issuer" text,
	"home_domain" text,
	"toml_name" text,
	"toml_org" text,
	"toml_image" text,
	"toml_desc" text,
	"toml_status" text,
	"anchor_asset" text,
	"anchor_type" text,
	"total_supply" numeric,
	"trustline_count" integer DEFAULT 0,
	"funded_trustlines" integer DEFAULT 0,
	"payment_count" bigint DEFAULT 0,
	"trade_count" bigint DEFAULT 0,
	"volume_7d" numeric DEFAULT '0',
	"rating_age" smallint DEFAULT 0,
	"rating_trades" smallint DEFAULT 0,
	"rating_payments" smallint DEFAULT 0,
	"rating_trustlines" smallint DEFAULT 0,
	"rating_volume" smallint DEFAULT 0,
	"rating_liquidity" smallint DEFAULT 0,
	"rating_interop" smallint DEFAULT 0,
	"rating_average" numeric(3, 1) DEFAULT '0',
	"is_verified" boolean DEFAULT false,
	"is_spam" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"local_icon" text
);
--> statement-breakpoint
CREATE TABLE "tx_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"tx_hash" text NOT NULL,
	"ledger_number" bigint,
	"operation_type" text NOT NULL,
	"asset_code" text,
	"asset_issuer" text,
	"amount" numeric,
	"from_address" text,
	"to_address" text,
	"memo" text,
	"memo_type" text,
	"fee_charged" bigint,
	"successful" boolean DEFAULT true,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tx_history_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "user_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"token_id" bigint,
	"contract_id" text,
	"is_favorite" boolean DEFAULT false,
	"is_hidden" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"added_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_secret" text,
	"network" text DEFAULT 'testnet' NOT NULL,
	"is_active" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar" text,
	"preferred_language" text DEFAULT 'en',
	"preferred_network" text DEFAULT 'testnet',
	"is_email_verified" boolean DEFAULT false,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"signing_mode" text DEFAULT 'self',
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contract_tokens" ADD CONSTRAINT "contract_tokens_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_contract_id_contract_tokens_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lp_assets" ON "liquidity_pools" USING btree ("asset_a_code","asset_b_code");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_token" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tokens_code_issuer" ON "tokens" USING btree ("asset_code","asset_issuer");--> statement-breakpoint
CREATE INDEX "idx_tokens_code" ON "tokens" USING btree ("asset_code");--> statement-breakpoint
CREATE INDEX "idx_tokens_issuer" ON "tokens" USING btree ("asset_issuer");--> statement-breakpoint
CREATE INDEX "idx_tokens_rating" ON "tokens" USING btree ("rating_average");--> statement-breakpoint
CREATE INDEX "idx_tokens_domain" ON "tokens" USING btree ("home_domain");--> statement-breakpoint
CREATE INDEX "idx_tx_history_pubkey" ON "tx_history" USING btree ("public_key","created_at");--> statement-breakpoint
CREATE INDEX "idx_tx_history_hash" ON "tx_history" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_tokens_pubkey_token" ON "user_tokens" USING btree ("public_key","token_id");--> statement-breakpoint
CREATE INDEX "idx_user_tokens_pubkey" ON "user_tokens" USING btree ("public_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_wallets_user_pubkey" ON "user_wallets" USING btree ("user_id","public_key");--> statement-breakpoint
CREATE INDEX "idx_user_wallets_user" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");