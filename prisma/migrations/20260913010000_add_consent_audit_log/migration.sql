CREATE TABLE "ConsentAuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "previousGranted" BOOLEAN,
    "granted" BOOLEAN NOT NULL,
    "source" VARCHAR(100),
    "action" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentAuditLog_userId_consentType_createdAt_idx"
    ON "ConsentAuditLog"("userId", "consentType", "createdAt");

CREATE INDEX "ConsentAuditLog_createdAt_idx"
    ON "ConsentAuditLog"("createdAt");

ALTER TABLE "ConsentAuditLog"
    ADD CONSTRAINT "ConsentAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_consent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Consent audit log entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_audit_log_immutable
BEFORE UPDATE OR DELETE ON "ConsentAuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_consent_audit_log_mutation();
