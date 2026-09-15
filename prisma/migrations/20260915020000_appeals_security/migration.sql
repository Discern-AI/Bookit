-- AlterTable
ALTER TABLE "BookReview" ADD COLUMN     "moderationVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReviewAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "moderationVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "ReviewAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAppeal_status_createdAt_idx" ON "ReviewAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAppeal_userId_createdAt_idx" ON "ReviewAppeal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewAppeal_userId_workId_moderationVersion_key" ON "ReviewAppeal"("userId", "workId", "moderationVersion");

-- AddForeignKey
ALTER TABLE "ReviewAppeal" ADD CONSTRAINT "ReviewAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAppeal" ADD CONSTRAINT "ReviewAppeal_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
