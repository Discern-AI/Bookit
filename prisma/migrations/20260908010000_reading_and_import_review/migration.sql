-- AlterTable
ALTER TABLE "ReadingSession" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "finished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "goalYear" INTEGER,
ADD COLUMN     "yearlyGoal" INTEGER;

-- CreateTable
CREATE TABLE "ImportReview" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "row" JSONB NOT NULL,
    "candidateIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "ImportReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportReview_jobId_rowIndex_key" ON "ImportReview"("jobId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingSession_requestId_key" ON "ReadingSession"("requestId");

-- AddForeignKey
ALTER TABLE "ImportReview" ADD CONSTRAINT "ImportReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
