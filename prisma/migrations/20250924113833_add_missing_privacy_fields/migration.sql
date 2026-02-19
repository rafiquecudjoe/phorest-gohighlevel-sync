-- AlterTable
ALTER TABLE "user_privacy_settings" ADD COLUMN     "allow_contact_share" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_activity_status" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_in_search" BOOLEAN NOT NULL DEFAULT true;
