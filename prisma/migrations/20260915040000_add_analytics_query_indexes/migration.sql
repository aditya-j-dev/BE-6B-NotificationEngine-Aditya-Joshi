-- Day 11.8: indexes aligned with the dashboard analytics read paths.
CREATE INDEX IF NOT EXISTS "NotificationStateLog_terminal_createdAt_idx"
ON "NotificationStateLog" ("createdAt")
WHERE "toStatus" IN ('DELIVERED', 'FAILED', 'BOUNCED');

CREATE INDEX IF NOT EXISTS "ConsentAuditLog_action_createdAt_idx"
ON "ConsentAuditLog" ("action", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_cost_analytics_idx"
ON "Notification" ("createdAt", "channel", "provider")
WHERE "costPaisa" IS NOT NULL;
