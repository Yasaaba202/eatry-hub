ALTER TABLE "VendorProfile"
ADD COLUMN "payoutPhone" TEXT,
ADD COLUMN "payoutNetwork" TEXT,
ADD COLUMN "payoutPhoneVerifiedAt" TIMESTAMP(3);

ALTER TABLE "Order"
ADD COLUMN "deliveryFeePayment" TEXT NOT NULL DEFAULT 'UPFRONT';

ALTER TABLE "Payout"
ADD COLUMN "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "netAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "destinationNumber" TEXT,
ADD COLUMN "destinationNetwork" TEXT;

CREATE TABLE "VendorPayoutPhoneCode" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorPayoutPhoneCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorPayoutPhoneCode_vendorId_key" ON "VendorPayoutPhoneCode"("vendorId");
CREATE INDEX "VendorPayoutPhoneCode_expiresAt_idx" ON "VendorPayoutPhoneCode"("expiresAt");

ALTER TABLE "VendorPayoutPhoneCode"
ADD CONSTRAINT "VendorPayoutPhoneCode_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
