-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('client', 'agent', 'staff');

-- CreateEnum
CREATE TYPE "PhorestSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "api_client" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "secret" VARCHAR(250) NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "ip_addresses" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "api_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghl_oauth_tokens" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ghl_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_mappings" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "ghl_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run_summaries" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "job_id" TEXT,
    "direction" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_run_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "job_id" TEXT,
    "batch_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "direction" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "source_data" JSONB,
    "target_data" JSONB,
    "response_data" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_audit_logs" (
    "id" TEXT NOT NULL,
    "audit_run_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "local_count" INTEGER NOT NULL,
    "ghl_count" INTEGER NOT NULL,
    "match" BOOLEAN NOT NULL,
    "discrepancy" INTEGER NOT NULL DEFAULT 0,
    "sample_checks" JSONB,
    "details" JSONB,
    "error_message" TEXT,
    "status" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "audited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reported_entities" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_code" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reported_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_staff" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "gender" TEXT,
    "birth_date" TEXT,
    "position" TEXT,
    "start_date" TEXT,
    "self_employed" BOOLEAN NOT NULL DEFAULT false,
    "staff_category_id" TEXT,
    "staff_category_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "image_url" TEXT,
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "ghl_contact_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_products" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT,
    "category_name" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "cost_price" DECIMAL(10,2),
    "sku" TEXT,
    "barcode" TEXT,
    "stock_level" INTEGER,
    "reorder_level" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "ghl_product_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_services" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT,
    "category_name" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "online_bookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "last_synced_at" TIMESTAMP(3),
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_clients" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "land_line" TEXT,
    "gender" TEXT,
    "birth_date" TEXT,
    "street_address_1" TEXT,
    "street_address_2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "preferred_staff_id" TEXT,
    "last_stylist_name" TEXT,
    "notes" TEXT,
    "client_category_ids" JSONB,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "sms_marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "email_marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "sms_reminder_consent" BOOLEAN NOT NULL DEFAULT true,
    "email_reminder_consent" BOOLEAN NOT NULL DEFAULT true,
    "loyalty_card_serial" TEXT,
    "loyalty_points" INTEGER,
    "client_since" TIMESTAMP(3),
    "first_visit" TIMESTAMP(3),
    "last_visit" TIMESTAMP(3),
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "ghl_contact_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_appointments" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "client_id" TEXT,
    "staff_id" TEXT,
    "service_id" TEXT,
    "booking_id" TEXT,
    "service_name" TEXT,
    "appointment_date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "activation_state" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(10,2),
    "deposit_amount" DECIMAL(10,2),
    "source" TEXT,
    "notes" TEXT,
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "ghl_event_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_client_categories" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phorest_client_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phorest_bookings" (
    "id" TEXT NOT NULL,
    "phorest_id" TEXT NOT NULL,
    "version" INTEGER,
    "branch_id" TEXT NOT NULL,
    "client_id" TEXT,
    "status" TEXT,
    "booking_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sync_status" "PhorestSyncStatus" NOT NULL DEFAULT 'PENDING',
    "ghl_event_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "phorest_created_at" TIMESTAMP(3),
    "phorest_updated_at" TIMESTAMP(3),

    CONSTRAINT "phorest_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_client_name_key" ON "api_client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ghl_oauth_tokens_location_id_key" ON "ghl_oauth_tokens"("location_id");

-- CreateIndex
CREATE INDEX "entity_mappings_phorest_id_idx" ON "entity_mappings"("phorest_id");

-- CreateIndex
CREATE INDEX "entity_mappings_ghl_id_idx" ON "entity_mappings"("ghl_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_mappings_entity_type_phorest_id_key" ON "entity_mappings"("entity_type", "phorest_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_run_summaries_batch_id_key" ON "sync_run_summaries"("batch_id");

-- CreateIndex
CREATE INDEX "sync_run_summaries_status_idx" ON "sync_run_summaries"("status");

-- CreateIndex
CREATE INDEX "sync_run_summaries_direction_entity_type_idx" ON "sync_run_summaries"("direction", "entity_type");

-- CreateIndex
CREATE INDEX "sync_run_summaries_created_at_idx" ON "sync_run_summaries"("created_at");

-- CreateIndex
CREATE INDEX "sync_logs_batch_id_idx" ON "sync_logs"("batch_id");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_entity_type_idx" ON "sync_logs"("entity_type");

-- CreateIndex
CREATE INDEX "sync_logs_created_at_idx" ON "sync_logs"("created_at");

-- CreateIndex
CREATE INDEX "sync_logs_status_created_at_idx" ON "sync_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "sync_logs_run_id_idx" ON "sync_logs"("run_id");

-- CreateIndex
CREATE INDEX "sync_audit_logs_audit_run_id_idx" ON "sync_audit_logs"("audit_run_id");

-- CreateIndex
CREATE INDEX "sync_audit_logs_entity_type_idx" ON "sync_audit_logs"("entity_type");

-- CreateIndex
CREATE INDEX "sync_audit_logs_match_idx" ON "sync_audit_logs"("match");

-- CreateIndex
CREATE INDEX "sync_audit_logs_audited_at_idx" ON "sync_audit_logs"("audited_at");

-- CreateIndex
CREATE INDEX "reported_entities_entity_type_timestamp_idx" ON "reported_entities"("entity_type", "timestamp");

-- CreateIndex
CREATE INDEX "reported_entities_resolved_idx" ON "reported_entities"("resolved");

-- CreateIndex
CREATE INDEX "reported_entities_timestamp_idx" ON "reported_entities"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_staff_phorest_id_key" ON "phorest_staff"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_staff_sync_status_idx" ON "phorest_staff"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_staff_email_idx" ON "phorest_staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_products_phorest_id_key" ON "phorest_products"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_products_sync_status_idx" ON "phorest_products"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_products_category_id_idx" ON "phorest_products"("category_id");

-- CreateIndex
CREATE INDEX "phorest_products_active_idx" ON "phorest_products"("active");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_services_phorest_id_key" ON "phorest_services"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_services_sync_status_idx" ON "phorest_services"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_services_category_id_idx" ON "phorest_services"("category_id");

-- CreateIndex
CREATE INDEX "phorest_services_active_idx" ON "phorest_services"("active");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_clients_phorest_id_key" ON "phorest_clients"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_clients_sync_status_idx" ON "phorest_clients"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_clients_email_idx" ON "phorest_clients"("email");

-- CreateIndex
CREATE INDEX "phorest_clients_mobile_idx" ON "phorest_clients"("mobile");

-- CreateIndex
CREATE INDEX "phorest_clients_ghl_contact_id_idx" ON "phorest_clients"("ghl_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_appointments_phorest_id_key" ON "phorest_appointments"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_appointments_sync_status_idx" ON "phorest_appointments"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_appointments_client_id_idx" ON "phorest_appointments"("client_id");

-- CreateIndex
CREATE INDEX "phorest_appointments_staff_id_idx" ON "phorest_appointments"("staff_id");

-- CreateIndex
CREATE INDEX "phorest_appointments_appointment_date_idx" ON "phorest_appointments"("appointment_date");

-- CreateIndex
CREATE INDEX "phorest_appointments_state_idx" ON "phorest_appointments"("state");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_client_categories_phorest_id_key" ON "phorest_client_categories"("phorest_id");

-- CreateIndex
CREATE UNIQUE INDEX "phorest_bookings_phorest_id_key" ON "phorest_bookings"("phorest_id");

-- CreateIndex
CREATE INDEX "phorest_bookings_sync_status_idx" ON "phorest_bookings"("sync_status");

-- CreateIndex
CREATE INDEX "phorest_bookings_client_id_idx" ON "phorest_bookings"("client_id");

-- CreateIndex
CREATE INDEX "phorest_bookings_booking_date_idx" ON "phorest_bookings"("booking_date");

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sync_run_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phorest_appointments" ADD CONSTRAINT "phorest_appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "phorest_clients"("phorest_id") ON DELETE SET NULL ON UPDATE CASCADE;

