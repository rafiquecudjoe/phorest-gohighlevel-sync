-- AlterTable
ALTER TABLE "user" ADD COLUMN     "identity_rejection_reason" TEXT,
ADD COLUMN     "identity_verified_at" TIMESTAMP(3),
ADD COLUMN     "sumsub_applicant_id" TEXT,
ADD COLUMN     "sumsub_inspection_id" TEXT;
