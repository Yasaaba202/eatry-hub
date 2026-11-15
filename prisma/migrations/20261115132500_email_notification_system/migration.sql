-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('CUSTOMER', 'VENDOR', 'ADMIN');
CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'PAYMENT', 'WALLET', 'PAYOUT', 'ACCOUNT', 'MARKETING', 'SYSTEM', 'SECURITY');
CREATE TYPE "EmailAudience" AS ENUM ('CUSTOMER', 'VENDOR', 'ADMIN');
CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'SECURITY', 'MARKETING');
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "audience" "NotificationAudience" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "event" TEXT,
ADD COLUMN     "meta" JSONB;
ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "audience" "EmailAudience" NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "event" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toUserId" TEXT,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "walletUpdates" BOOLEAN NOT NULL DEFAULT true,
    "payoutUpdates" BOOLEAN NOT NULL DEFAULT true,
    "newMeals" BOOLEAN NOT NULL DEFAULT false,
    "promotions" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribeToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_idempotencyKey_key" ON "EmailMessage"("idempotencyKey");
CREATE INDEX "EmailMessage_status_scheduledAt_idx" ON "EmailMessage"("status", "scheduledAt");
CREATE INDEX "EmailMessage_toUserId_createdAt_idx" ON "EmailMessage"("toUserId", "createdAt");
CREATE INDEX "EmailMessage_relatedType_relatedId_idx" ON "EmailMessage"("relatedType", "relatedId");

CREATE UNIQUE INDEX "EmailVerificationToken_userId_key" ON "EmailVerificationToken"("userId");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE UNIQUE INDEX "NotificationPreference_unsubscribeToken_key" ON "NotificationPreference"("unsubscribeToken");

CREATE UNIQUE INDEX "VendorFollow_userId_vendorId_key" ON "VendorFollow"("userId", "vendorId");
CREATE INDEX "VendorFollow_vendorId_idx" ON "VendorFollow"("vendorId");

CREATE INDEX "Notification_audience_createdAt_idx" ON "Notification"("audience", "createdAt");
CREATE INDEX "Notification_category_createdAt_idx" ON "Notification"("category", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorFollow" ADD CONSTRAINT "VendorFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorFollow" ADD CONSTRAINT "VendorFollow_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settings
INSERT INTO "PlatformSetting" ("key","value","updatedAt") VALUES
  ('notification_admin_emails', '[]'::jsonb, NOW()),
  ('notification_settings', '{"adminOrderAlerts":true,"adminPaymentAlerts":true,"adminPayoutAlerts":true,"adminVendorAlerts":true,"adminSystemAlerts":true,"vendorOrderAlerts":true,"customerOrderAlerts":true,"mealAnnouncements":true}'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;