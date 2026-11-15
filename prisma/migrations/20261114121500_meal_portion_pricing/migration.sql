ALTER TABLE "Meal"
    ADD COLUMN "smallPrice" DECIMAL(10,2),
    ADD COLUMN "mediumPrice" DECIMAL(10,2),
    ADD COLUMN "largePrice" DECIMAL(10,2);

ALTER TABLE "VendorOrderItem"
    ADD COLUMN "portionSize" TEXT;
