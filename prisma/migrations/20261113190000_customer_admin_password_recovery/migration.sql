ALTER TABLE "VendorPasswordResetCode" RENAME TO "AccountPasswordResetCode";
ALTER INDEX "VendorPasswordResetCode_userId_key" RENAME TO "AccountPasswordResetCode_userId_key";
ALTER INDEX "VendorPasswordResetCode_expiresAt_idx" RENAME TO "AccountPasswordResetCode_expiresAt_idx";
ALTER TABLE "AccountPasswordResetCode" RENAME CONSTRAINT "VendorPasswordResetCode_pkey" TO "AccountPasswordResetCode_pkey";
ALTER TABLE "AccountPasswordResetCode" RENAME CONSTRAINT "VendorPasswordResetCode_userId_fkey" TO "AccountPasswordResetCode_userId_fkey";

CREATE TABLE "AdminCredential" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPasswordResetCode" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminPasswordResetCode_pkey" PRIMARY KEY ("email")
);
CREATE INDEX "AdminPasswordResetCode_expiresAt_idx" ON "AdminPasswordResetCode"("expiresAt");
