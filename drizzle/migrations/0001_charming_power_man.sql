CREATE TABLE "dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"quote_amount_uyu" integer,
	"quote_materials_included" boolean,
	"quote_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trade" text NOT NULL,
	"area_m2" integer NOT NULL,
	"department" text NOT NULL,
	"zone" text NOT NULL,
	"budget_min_uyu" integer NOT NULL,
	"budget_max_uyu" integer NOT NULL,
	"timeline" text NOT NULL,
	"materials_included" boolean NOT NULL,
	"description" text NOT NULL,
	"contact_phone" text NOT NULL,
	"provider_ids" text[] NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "request_user_id_idempotency_key_unique" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "dispatch_request_id_idx" ON "dispatch" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_user_id_idx" ON "request" USING btree ("user_id");