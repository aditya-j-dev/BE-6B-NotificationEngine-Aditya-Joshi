CREATE TABLE "QuietHoursBypassAuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notificationId" UUID NOT NULL,
    "eventId" VARCHAR(50) NOT NULL,
    "eventType" VARCHAR(30) NOT NULL,
    "userId" UUID NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL,
    "localTime" VARCHAR(5) NOT NULL,
    "quietHoursStart" VARCHAR(5) NOT NULL,
    "quietHoursEnd" VARCHAR(5) NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuietHoursBypassAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuietHoursBypassAuditLog_userId_createdAt_idx"
    ON "QuietHoursBypassAuditLog"("userId", "createdAt");
CREATE INDEX "QuietHoursBypassAuditLog_notificationId_idx"
    ON "QuietHoursBypassAuditLog"("notificationId");
CREATE INDEX "QuietHoursBypassAuditLog_createdAt_idx"
    ON "QuietHoursBypassAuditLog"("createdAt");

ALTER TABLE "QuietHoursBypassAuditLog"
    ADD CONSTRAINT "QuietHoursBypassAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_quiet_hours_bypass_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Quiet-hours bypass audit log entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quiet_hours_bypass_audit_log_immutable
BEFORE UPDATE OR DELETE ON "QuietHoursBypassAuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_quiet_hours_bypass_audit_log_mutation();
