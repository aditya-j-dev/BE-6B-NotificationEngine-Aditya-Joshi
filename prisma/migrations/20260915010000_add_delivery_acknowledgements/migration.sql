-- Persist provider delivery callbacks so delivery state is auditable and callbacks are idempotent.
CREATE TABLE "DeliveryAcknowledgement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(50) NOT NULL,
    "callbackId" VARCHAR(191) NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "providerStatus" VARCHAR(50) NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "notificationId" UUID,
    "notificationCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryAcknowledgement_provider_callbackId_key"
    ON "DeliveryAcknowledgement"("provider", "callbackId");
CREATE INDEX "DeliveryAcknowledgement_provider_externalId_idx"
    ON "DeliveryAcknowledgement"("provider", "externalId");
CREATE INDEX "DeliveryAcknowledgement_notificationId_idx"
    ON "DeliveryAcknowledgement"("notificationId");
CREATE INDEX "DeliveryAcknowledgement_createdAt_idx"
    ON "DeliveryAcknowledgement"("createdAt");

ALTER TABLE "DeliveryAcknowledgement"
    ADD CONSTRAINT "DeliveryAcknowledgement_notificationId_notificationCreatedAt_fkey"
    FOREIGN KEY ("notificationId", "notificationCreatedAt")
    REFERENCES "Notification"("id", "createdAt")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
