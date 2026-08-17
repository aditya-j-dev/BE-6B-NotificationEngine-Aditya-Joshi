-- DropIndex
DROP INDEX "Notification_createdAt_brin_idx";

-- DropIndex
DROP INDEX "Notification_eventType_createdAt_idx";

-- DropIndex
DROP INDEX "Notification_personalizationData_gin_idx";

-- DropIndex
DROP INDEX "Notification_userId_status_channel_idx";

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "eventType" SET DATA TYPE VARCHAR(30);
