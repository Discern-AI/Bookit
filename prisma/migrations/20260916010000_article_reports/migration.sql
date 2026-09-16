-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderationVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ArticleReport" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "publishedVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "imageIds" TEXT[],
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decisionVersion" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "restoreNote" TEXT NOT NULL DEFAULT '',
    "restoredById" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleReport_status_createdAt_idx" ON "ArticleReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleReport_articleId_reporterId_publishedVersion_key" ON "ArticleReport"("articleId", "reporterId", "publishedVersion");

-- AddForeignKey
ALTER TABLE "ArticleReport" ADD CONSTRAINT "ArticleReport_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleReport" ADD CONSTRAINT "ArticleReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
