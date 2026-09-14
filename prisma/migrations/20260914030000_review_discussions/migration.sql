-- AlterTable
ALTER TABLE "BookReview" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isModerator" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReviewLike" (
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,

    CONSTRAINT "ReviewLike_pkey" PRIMARY KEY ("userId","reviewId")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "snapshot" TEXT NOT NULL,
    "resolvedById" TEXT,
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "commentId" TEXT,
    "targetKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewLike_reviewId_idx" ON "ReviewLike"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewComment_reviewId_createdAt_idx" ON "ReviewComment"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewComment_userId_createdAt_idx" ON "ReviewComment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_status_createdAt_idx" ON "ReviewReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReport_reporterId_targetKey_key" ON "ReviewReport"("reporterId", "targetKey");

-- AddForeignKey
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "BookReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "BookReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "BookReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ReviewComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
