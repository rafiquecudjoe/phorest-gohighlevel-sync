/*
  Warnings:

  - You are about to drop the `agent_bids` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_certifications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `agent_reviews` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `general_preferences` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `idempotency_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inspection_reports` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inspection_requests` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `matching_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_preferences` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `refunds` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `report_media` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `request_assignments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `request_communications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `request_matching_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sumsub_webhook_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_payment_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_privacy_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webhook_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "agent_bids" DROP CONSTRAINT "agent_bids_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_bids" DROP CONSTRAINT "agent_bids_request_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_certifications" DROP CONSTRAINT "agent_certifications_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_profiles" DROP CONSTRAINT "agent_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_reviews" DROP CONSTRAINT "agent_reviews_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_reviews" DROP CONSTRAINT "agent_reviews_client_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_reviews" DROP CONSTRAINT "agent_reviews_request_id_fkey";

-- DropForeignKey
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_user_id_fkey";

-- DropForeignKey
ALTER TABLE "inspection_reports" DROP CONSTRAINT "inspection_reports_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "inspection_requests" DROP CONSTRAINT "inspection_requests_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_payment_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "report_media" DROP CONSTRAINT "report_media_report_id_fkey";

-- DropForeignKey
ALTER TABLE "request_assignments" DROP CONSTRAINT "request_assignments_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "request_assignments" DROP CONSTRAINT "request_assignments_request_id_fkey";

-- DropForeignKey
ALTER TABLE "request_communications" DROP CONSTRAINT "request_communications_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "request_communications" DROP CONSTRAINT "request_communications_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "request_communications" DROP CONSTRAINT "request_communications_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "request_matching_history" DROP CONSTRAINT "request_matching_history_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "request_matching_history" DROP CONSTRAINT "request_matching_history_request_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_refund_id_fkey";

-- DropForeignKey
ALTER TABLE "user_history" DROP CONSTRAINT "user_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_payment_profiles" DROP CONSTRAINT "user_payment_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_privacy_settings" DROP CONSTRAINT "user_privacy_settings_user_id_fkey";

-- DropTable
DROP TABLE "agent_bids";

-- DropTable
DROP TABLE "agent_certifications";

-- DropTable
DROP TABLE "agent_profiles";

-- DropTable
DROP TABLE "agent_reviews";

-- DropTable
DROP TABLE "general_preferences";

-- DropTable
DROP TABLE "idempotency_keys";

-- DropTable
DROP TABLE "inspection_reports";

-- DropTable
DROP TABLE "inspection_requests";

-- DropTable
DROP TABLE "matching_rules";

-- DropTable
DROP TABLE "notification_preferences";

-- DropTable
DROP TABLE "payments";

-- DropTable
DROP TABLE "refunds";

-- DropTable
DROP TABLE "report_media";

-- DropTable
DROP TABLE "request_assignments";

-- DropTable
DROP TABLE "request_communications";

-- DropTable
DROP TABLE "request_matching_history";

-- DropTable
DROP TABLE "sumsub_webhook_events";

-- DropTable
DROP TABLE "transactions";

-- DropTable
DROP TABLE "user";

-- DropTable
DROP TABLE "user_history";

-- DropTable
DROP TABLE "user_payment_profiles";

-- DropTable
DROP TABLE "user_privacy_settings";

-- DropTable
DROP TABLE "webhook_events";

-- DropEnum
DROP TYPE "AgentStatus";

-- DropEnum
DROP TYPE "AssignmentType";

-- DropEnum
DROP TYPE "AvailabilityStatus";

-- DropEnum
DROP TYPE "BidStatus";

-- DropEnum
DROP TYPE "CertificationStatus";

-- DropEnum
DROP TYPE "CertificationType";

-- DropEnum
DROP TYPE "IdempotencyStatus";

-- DropEnum
DROP TYPE "MatchingMode";

-- DropEnum
DROP TYPE "MatchingResult";

-- DropEnum
DROP TYPE "MatchingStatus";

-- DropEnum
DROP TYPE "MatchingType";

-- DropEnum
DROP TYPE "MediaType";

-- DropEnum
DROP TYPE "MessageType";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "PreferredContact";

-- DropEnum
DROP TYPE "ProfileVisibility";

-- DropEnum
DROP TYPE "RefundStatus";

-- DropEnum
DROP TYPE "RequestStatus";

-- DropEnum
DROP TYPE "RequestUrgency";

-- DropEnum
DROP TYPE "RuleType";

-- DropEnum
DROP TYPE "ServiceTier";

-- DropEnum
DROP TYPE "SignUpMethod";

-- DropEnum
DROP TYPE "TransactionType";

-- DropEnum
DROP TYPE "UserStatus";

-- DropEnum
DROP TYPE "WebhookEventStatus";

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

-- CreateIndex
CREATE UNIQUE INDEX "ghl_oauth_tokens_location_id_key" ON "ghl_oauth_tokens"("location_id");

-- CreateIndex
CREATE INDEX "entity_mappings_phorest_id_idx" ON "entity_mappings"("phorest_id");

-- CreateIndex
CREATE INDEX "entity_mappings_ghl_id_idx" ON "entity_mappings"("ghl_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_mappings_entity_type_phorest_id_key" ON "entity_mappings"("entity_type", "phorest_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_mappings_entity_type_ghl_id_key" ON "entity_mappings"("entity_type", "ghl_id");

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

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sync_run_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
