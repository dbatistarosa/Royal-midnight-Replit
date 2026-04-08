CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'passenger' NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"color" text NOT NULL,
	"plate" text NOT NULL,
	"vehicle_class" text DEFAULT 'standard' NOT NULL,
	"capacity" integer DEFAULT 3 NOT NULL,
	"image_url" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"license_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"rating" numeric(3, 2),
	"total_rides" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vehicle_year" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_color" text,
	"vehicle_class" text,
	"passenger_capacity" integer,
	"luggage_capacity" integer,
	"has_car_seat" boolean DEFAULT false,
	"service_area" text,
	"license_expiry" text,
	"license_doc" text,
	"reg_vin" text,
	"reg_plate" text,
	"reg_expiry" text,
	"reg_doc" text,
	"insurance_expiry" text,
	"insurance_doc" text,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"location_updated_at" timestamp with time zone,
	"profile_picture" text,
	"payout_legal_name" text,
	"payout_email" text,
	"payout_ssn" text,
	"payout_bank_name" text,
	"payout_routing_number" text,
	"payout_account_number" text,
	CONSTRAINT "drivers_email_unique" UNIQUE("email"),
	CONSTRAINT "drivers_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"passenger_name" text NOT NULL,
	"passenger_email" text NOT NULL,
	"passenger_phone" text NOT NULL,
	"pickup_address" text NOT NULL,
	"dropoff_address" text NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"vehicle_class" text DEFAULT 'standard' NOT NULL,
	"passengers" integer DEFAULT 1 NOT NULL,
	"luggage_count" integer DEFAULT 0 NOT NULL,
	"flight_number" text,
	"special_requests" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"price_quoted" numeric(10, 2) NOT NULL,
	"promo_code" text,
	"discount_amount" numeric(10, 2),
	"driver_id" integer,
	"vehicle_id" integer,
	"payment_type" text DEFAULT 'standard',
	"stripe_payment_intent_id" text,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"user_id" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"booking_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'system' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"booking_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"min_booking_amount" numeric(10, 2),
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vehicle_class" text,
	"base_fare" numeric(10, 2) NOT NULL,
	"rate_per_mile" numeric(10, 2) NOT NULL,
	"airport_surcharge" numeric(10, 2) DEFAULT '15' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" integer,
	"author_role" text DEFAULT 'passenger' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'skipped' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"min_year" integer NOT NULL,
	"vehicle_types" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
