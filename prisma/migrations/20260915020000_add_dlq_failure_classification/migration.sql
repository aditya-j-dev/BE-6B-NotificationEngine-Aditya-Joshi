CREATE TYPE "DlqFailureClassification" AS ENUM ('TRANSIENT', 'PERMANENT', 'CONFIGURATION_ERROR');

ALTER TABLE "DeadLetterQueue"
    ADD COLUMN "classification" "DlqFailureClassification";

CREATE INDEX "DeadLetterQueue_classification_createdAt_idx"
    ON "DeadLetterQueue"("classification", "createdAt");
