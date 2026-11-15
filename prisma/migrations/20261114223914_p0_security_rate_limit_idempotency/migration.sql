-- Additive P0 security tables only. No existing customer, vendor, order, or payment data is modified.

-- CreateTable
CREATE TABLE "SecurityRateLimit" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "resourceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityRateLimit_scope_keyHash_windowStart_key" ON "SecurityRateLimit"("scope", "keyHash", "windowStart");

-- CreateIndex
CREATE INDEX "SecurityRateLimit_blockedUntil_idx" ON "SecurityRateLimit"("blockedUntil");

-- CreateIndex
CREATE INDEX "SecurityRateLimit_updatedAt_idx" ON "SecurityRateLimit"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_actorKey_idempotencyKey_key" ON "IdempotencyRecord"("scope", "actorKey", "idempotencyKey");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
