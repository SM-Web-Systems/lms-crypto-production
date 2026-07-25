CREATE TABLE "address_book" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"memo" text,
	"memo_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'login' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nft_collections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(10) DEFAULT 'sep50' NOT NULL,
	"contract_id" varchar(56),
	"asset_code" varchar(12),
	"asset_issuer" varchar(56),
	"name" text,
	"symbol" varchar(20),
	"base_uri" text,
	"description" text,
	"image" text,
	"creator" varchar(56),
	"total_supply" integer DEFAULT 0,
	"is_verified" boolean DEFAULT false,
	"network" varchar(10) DEFAULT 'public' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nft_collections_contract_id_unique" UNIQUE("contract_id")
);
--> statement-breakpoint
CREATE TABLE "nft_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"token_id" integer NOT NULL,
	"owner" varchar(56),
	"metadata_uri" text,
	"name" text,
	"description" text,
	"image" text,
	"attributes" jsonb DEFAULT '[]'::jsonb,
	"is_burned" boolean DEFAULT false,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"wallet_public_key" text NOT NULL,
	"total_xlm" numeric DEFAULT '0' NOT NULL,
	"total_usd" numeric DEFAULT '0' NOT NULL,
	"asset_breakdown" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "user_wallets" ALTER COLUMN "network" SET DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_network" SET DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "signing_mode" SET DEFAULT 'delegated';--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "network" varchar(10) DEFAULT 'pubnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_fa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_fa_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_fa_method" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_fa_backup_codes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_fa_static_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_failed_login" timestamp;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_tokens" ADD CONSTRAINT "nft_tokens_collection_id_nft_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."nft_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_codes_user" ON "email_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_nft_collection_token" ON "nft_tokens" USING btree ("collection_id","token_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");