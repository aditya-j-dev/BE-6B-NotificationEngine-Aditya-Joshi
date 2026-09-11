ALTER TABLE "Template"
ADD COLUMN "experimentKey" TEXT,
ADD COLUMN "variant" TEXT,
ADD COLUMN "variantWeight" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "Template_experimentKey_variant_idx"
ON "Template" ("experimentKey", "variant");
