-- AlterTable
ALTER TABLE "GiftContact" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "GiftItem" ADD COLUMN     "claimVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GiftContact_shareToken_key" ON "GiftContact"("shareToken");

-- AddForeignKey
ALTER TABLE "GiftItem" ADD CONSTRAINT "GiftItem_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
