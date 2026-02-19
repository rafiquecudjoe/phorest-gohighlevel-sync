-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('public', 'verified_only', 'agents_only', 'private');

-- CreateTable
CREATE TABLE "user_privacy_settings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "profile_visibility" "ProfileVisibility" NOT NULL DEFAULT 'verified_only',
    "show_location" BOOLEAN NOT NULL DEFAULT true,
    "show_rating" BOOLEAN NOT NULL DEFAULT true,
    "allow_direct_contact" BOOLEAN NOT NULL DEFAULT true,
    "show_phone_number" BOOLEAN NOT NULL DEFAULT false,
    "show_email" BOOLEAN NOT NULL DEFAULT false,
    "allow_public_reviews" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_privacy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_privacy_settings_user_id_key" ON "user_privacy_settings"("user_id");

-- AddForeignKey
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
