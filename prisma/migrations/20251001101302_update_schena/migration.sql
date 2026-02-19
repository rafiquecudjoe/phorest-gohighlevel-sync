-- CreateTable
CREATE TABLE "general_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "preferred_language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "time_zone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "date_format" VARCHAR(20) NOT NULL DEFAULT 'MM/DD/YYYY',
    "time_format" VARCHAR(5) NOT NULL DEFAULT '12h',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "general_preferences_user_id_key" ON "general_preferences"("user_id");
