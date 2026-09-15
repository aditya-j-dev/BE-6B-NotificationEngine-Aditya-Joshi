-- Day 11.8 query-plan evidence. Run this script before and after applying the
-- 20260915040000_add_analytics_query_indexes migration and retain both outputs.

EXPLAIN (ANALYZE, BUFFERS)
SELECT state_log."notificationId", state_log."notificationCreatedAt", state_log."toStatus", state_log."createdAt"
FROM "NotificationStateLog" AS state_log
JOIN "Notification" AS notification
  ON notification."id" = state_log."notificationId"
 AND notification."createdAt" = state_log."notificationCreatedAt"
WHERE state_log."createdAt" >= NOW() - INTERVAL '7 days'
  AND state_log."toStatus" IN ('DELIVERED', 'FAILED', 'BOUNCED')
  AND notification."channel" = 'EMAIL'
ORDER BY state_log."createdAt" ASC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT "consentType", "createdAt"
FROM "ConsentAuditLog"
WHERE "action" = 'OPT_OUT'
  AND "createdAt" >= NOW() - INTERVAL '30 days'
ORDER BY "createdAt" ASC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT "channel", "provider", "status", "costPaisa"
FROM "Notification"
WHERE "costPaisa" IS NOT NULL
  AND "createdAt" >= NOW() - INTERVAL '30 days'
  AND "channel" = 'EMAIL'
ORDER BY "createdAt" ASC;
