-- DropIndex
DROP INDEX "BookReview_userId_workId_key";

-- AlterTable
ALTER TABLE "BookReview" ADD COLUMN     "active" BOOLEAN DEFAULT true,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BookReview_userId_workId_version_idx" ON "BookReview"("userId", "workId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BookReview_userId_workId_active_key" ON "BookReview"("userId", "workId", "active");
