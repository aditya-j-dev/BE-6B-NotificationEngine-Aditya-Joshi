-- Restore the A8.2 indexes that were removed while expanding event-type lengths.
-- These are additive and safe for the existing partitioned Notification table.
CREATE INDEX IF NOT EXISTS "Notification_userId_status_channel_idx"
ON "Notification" ("userId", "status", "channel");

CREATE INDEX IF NOT EXISTS "Notification_createdAt_brin_idx"
ON "Notification" USING BRIN ("createdAt");

CREATE INDEX IF NOT EXISTS "Notification_personalizationData_gin_idx"
ON "Notification" USING GIN ("personalizationData");

CREATE INDEX IF NOT EXISTS "Notification_eventType_createdAt_idx"
ON "Notification" ("eventType", "createdAt");
