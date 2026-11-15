CREATE TABLE "VendorPasswordResetCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPasswordResetCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorPasswordResetCode_userId_key"
    ON "VendorPasswordResetCode"("userId");
CREATE INDEX "VendorPasswordResetCode_expiresAt_idx"
    ON "VendorPasswordResetCode"("expiresAt");

ALTER TABLE "VendorPasswordResetCode"
    ADD CONSTRAINT "VendorPasswordResetCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
