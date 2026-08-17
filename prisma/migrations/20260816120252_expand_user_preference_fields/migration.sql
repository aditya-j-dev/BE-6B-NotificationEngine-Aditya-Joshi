/*
  Warnings:

  - The primary key for the `UserPreference` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "UserPreference" DROP CONSTRAINT "UserPreference_pkey",
ALTER COLUMN "eventType" SET DATA TYPE VARCHAR(50),
ADD CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId", "eventCategory", "eventType", "channel");
