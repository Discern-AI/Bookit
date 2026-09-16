-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "sourceReviewId" TEXT,
ADD COLUMN     "sourceReviewVersion" INTEGER;

-- CreateTable
CREATE TABLE "ArticleAppeal" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "moderationVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "imageIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "ArticleAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleAppeal_status_createdAt_idx" ON "ArticleAppeal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAppeal_articleId_moderationVersion_key" ON "ArticleAppeal"("articleId", "moderationVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Article_userId_sourceReviewId_sourceReviewVersion_key" ON "Article"("userId", "sourceReviewId", "sourceReviewVersion");

-- AddForeignKey
ALTER TABLE "ArticleAppeal" ADD CONSTRAINT "ArticleAppeal_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
