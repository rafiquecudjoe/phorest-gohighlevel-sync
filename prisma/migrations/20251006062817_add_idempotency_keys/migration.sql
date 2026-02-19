-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('processing', 'completed', 'failed', 'expired');

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" SERIAL NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "request_body" JSONB NOT NULL,
    "request_headers" JSONB,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "stripe_idempotency_key" VARCHAR(255),
    "stripe_request_id" VARCHAR(255),
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'processing',
    "processing_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_idempotency_key_key" ON "idempotency_keys"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_stripe_idempotency_key_key" ON "idempotency_keys"("stripe_idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_id_endpoint_idx" ON "idempotency_keys"("user_id", "endpoint");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_status_created_at_idx" ON "idempotency_keys"("status", "created_at");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
