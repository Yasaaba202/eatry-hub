-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "senderNetwork" TEXT;

-- CreateTable
CREATE TABLE "MenuTemplate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuTemplate_categoryId_name_key" ON "MenuTemplate"("categoryId", "name");

-- CreateIndex
CREATE INDEX "MenuTemplate_name_idx" ON "MenuTemplate"("name");

-- AddForeignKey
ALTER TABLE "MenuTemplate" ADD CONSTRAINT "MenuTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
