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
