-- Notification state history is append-heavy and analytics queries are time-range scans.
-- A BRIN index remains compact while allowing PostgreSQL to skip unrelated ranges.
DROP INDEX IF EXISTS "NotificationStateLog_createdAt_idx";

CREATE INDEX IF NOT EXISTS "NotificationStateLog_createdAt_brin_idx"
ON "NotificationStateLog" USING BRIN ("createdAt");
