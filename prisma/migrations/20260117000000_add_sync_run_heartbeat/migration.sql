-- AlterTable: Add updatedAt column to sync_run_summaries for heartbeat tracking
ALTER TABLE "sync_run_summaries" 
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
