-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blogVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publishedTitle" TEXT,
    "publishedExcerpt" TEXT,
    "publishedContent" JSONB,
    "publishedVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "publishedReadMinutes" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Article_userId_updatedAt_idx" ON "Article"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Article_isPublic_publishedAt_idx" ON "Article"("isPublic", "publishedAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
