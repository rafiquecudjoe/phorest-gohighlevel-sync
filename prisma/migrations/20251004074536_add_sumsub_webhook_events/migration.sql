-- CreateTable
CREATE TABLE "sumsub_webhook_events" (
    "id" SERIAL NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "applicant_id" VARCHAR(255) NOT NULL,
    "inspection_id" VARCHAR(255),
    "correlation_id" VARCHAR(255),
    "external_user_id" VARCHAR(255),
    "review_status" VARCHAR(50),
    "review_result" VARCHAR(50),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "raw_payload" JSONB NOT NULL,
    "processing_error" TEXT,
    "signature" VARCHAR(255),
    "sandbox_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "sumsub_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sumsub_webhook_events_applicant_id_idx" ON "sumsub_webhook_events"("applicant_id");

-- CreateIndex
CREATE INDEX "sumsub_webhook_events_external_user_id_idx" ON "sumsub_webhook_events"("external_user_id");

-- CreateIndex
CREATE INDEX "sumsub_webhook_events_event_type_processed_idx" ON "sumsub_webhook_events"("event_type", "processed");

-- CreateIndex
CREATE INDEX "sumsub_webhook_events_created_at_idx" ON "sumsub_webhook_events"("created_at");
