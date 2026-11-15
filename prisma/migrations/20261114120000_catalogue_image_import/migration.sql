CREATE TYPE "FoodImageStatus" AS ENUM (
    'PENDING',
    'NEEDS_REVIEW',
    'VERIFIED',
    'AWAITING_IMAGE',
    'FAILED'
);

ALTER TABLE "MenuTemplate"
    ADD COLUMN "imageSourceUrl" TEXT,
    ADD COLUMN "imageAuthor" TEXT,
    ADD COLUMN "imageLicense" TEXT,
    ADD COLUMN "imageLicenseUrl" TEXT,
    ADD COLUMN "imageSha256" TEXT,
    ADD COLUMN "imageStatus" "FoodImageStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "imageImportError" TEXT,
    ADD COLUMN "imageLastTriedAt" TIMESTAMP(3),
    ADD COLUMN "imageImportTries" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "MenuTemplate_imageStatus_imageLastTriedAt_idx"
    ON "MenuTemplate"("imageStatus", "imageLastTriedAt");

CREATE INDEX "MenuTemplate_imageSha256_idx"
    ON "MenuTemplate"("imageSha256");

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuTemplate" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active food categories"
    ON "Category" FOR SELECT
    USING ("isActive" = true);

CREATE POLICY "Public can read templates in active categories"
    ON "MenuTemplate" FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM "Category" AS category
        WHERE category."id" = "MenuTemplate"."categoryId"
          AND category."isActive" = true
    ));
