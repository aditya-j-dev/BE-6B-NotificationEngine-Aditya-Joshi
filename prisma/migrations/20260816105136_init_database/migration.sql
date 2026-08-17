-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('CREATED', 'ENRICHED', 'ROUTED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RETRYING', 'BOUNCED', 'DLQ', 'CAPPED', 'QUIET', 'DND');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'PUSH', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TRANSACTIONAL', 'PROMOTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "ProviderChannel" AS ENUM ('SMS', 'EMAIL', 'PUSH', 'WHATSAPP', 'IN_APP');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" VARCHAR(10) NOT NULL,
    "eventId" VARCHAR(50) NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" "NotificationStatus" NOT NULL DEFAULT 'CREATED',
    "templateId" VARCHAR(50) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "personalizationData" JSONB NOT NULL,
    "renderedContent" JSONB,
    "provider" VARCHAR(30),
    "externalId" VARCHAR(100),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "costPaisa" INTEGER,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryProviderId" UUID,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id","createdAt")
) PARTITION BY RANGE ("createdAt");

CREATE TABLE "Notification_2026_08"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE "Notification_2026_09"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE "Notification_2026_10"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE "Notification_2026_11"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE "Notification_2026_12"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE "Notification_2027_01"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE "Notification_2027_02"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE "Notification_2027_03"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE "Notification_2027_04"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE "Notification_2027_05"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE "Notification_2027_06"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE "Notification_2027_07"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE "Notification_2027_08"
    PARTITION OF "Notification"
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE "Notification_default"
    PARTITION OF "Notification"
    DEFAULT;

-- CreateTable
CREATE TABLE "NotificationStateLog" (
    "id" BIGSERIAL NOT NULL,
    "notificationId" UUID NOT NULL,
    "notificationCreatedAt" TIMESTAMP(3) NOT NULL,
    "fromStatus" "NotificationStatus",
    "toStatus" "NotificationStatus" NOT NULL,
    "actor" VARCHAR(50) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationStateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterQueue" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "notificationCreatedAt" TIMESTAMP(3) NOT NULL,
    "originalEvent" JSONB NOT NULL,
    "failureReason" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "lastError" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" VARCHAR(50),
    "resolvedAt" TIMESTAMP(3),
    "resolutionAction" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" UUID NOT NULL,
    "eventCategory" VARCHAR(10) NOT NULL,
    "eventType" VARCHAR(10) NOT NULL DEFAULT '*',
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursOverride" BOOLEAN NOT NULL DEFAULT false,
    "digestMode" VARCHAR(20) NOT NULL DEFAULT 'immediate',
    "priorityOverride" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId","eventCategory","eventType","channel")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "templateKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProvider" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ProviderChannel" NOT NULL,
    "endpoint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerSec" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- A8.2: User notification queries
CREATE INDEX "Notification_userId_status_channel_idx"
ON "Notification" ("userId", "status", "channel");

-- A8.2: Worker queries for queued/retrying notifications
CREATE INDEX "Notification_queued_retrying_status_idx"
ON "Notification" ("status")
WHERE "status" IN ('QUEUED', 'RETRYING');

-- A8.2: Time-range scans
CREATE INDEX "Notification_createdAt_brin_idx"
ON "Notification"
USING BRIN ("createdAt");

-- A8.2: JSONB personalisation queries
CREATE INDEX "Notification_personalizationData_gin_idx"
ON "Notification"
USING GIN ("personalizationData");

-- A8.2: Analytics aggregations
CREATE INDEX "Notification_eventType_createdAt_idx"
ON "Notification" ("eventType", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "NotificationStateLog_notificationId_idx" ON "NotificationStateLog"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationStateLog_createdAt_idx" ON "NotificationStateLog"("createdAt");

-- CreateIndex
CREATE INDEX "Template_eventType_channel_language_idx" ON "Template"("eventType", "channel", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Template_templateKey_channel_language_version_key" ON "Template"("templateKey", "channel", "language", "version");

-- CreateIndex
CREATE INDEX "DeliveryProvider_channel_active_priority_idx" ON "DeliveryProvider"("channel", "active", "priority");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_consentType_idx" ON "ConsentRecord"("userId", "consentType");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deliveryProviderId_fkey" FOREIGN KEY ("deliveryProviderId") REFERENCES "DeliveryProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationStateLog" ADD CONSTRAINT "NotificationStateLog_notificationId_notificationCreatedAt_fkey" FOREIGN KEY ("notificationId", "notificationCreatedAt") REFERENCES "Notification"("id", "createdAt") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" ADD CONSTRAINT "DeadLetterQueue_notificationId_notificationCreatedAt_fkey" FOREIGN KEY ("notificationId", "notificationCreatedAt") REFERENCES "Notification"("id", "createdAt") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
