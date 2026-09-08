-- CreateTable
CREATE TABLE "ReadingPath" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingPathEntry" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ReadingPathEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingPathFollow" (
    "userId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingPathFollow_pkey" PRIMARY KEY ("userId","pathId")
);

-- CreateIndex
CREATE INDEX "ReadingPath_userId_updatedAt_idx" ON "ReadingPath"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ReadingPath_isPublic_updatedAt_idx" ON "ReadingPath"("isPublic", "updatedAt");

-- CreateIndex
CREATE INDEX "ReadingPathEntry_workId_idx" ON "ReadingPathEntry"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPathEntry_pathId_workId_key" ON "ReadingPathEntry"("pathId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPathEntry_pathId_position_key" ON "ReadingPathEntry"("pathId", "position");

-- CreateIndex
CREATE INDEX "ReadingPathFollow_pathId_idx" ON "ReadingPathFollow"("pathId");

-- AddForeignKey
ALTER TABLE "ReadingPath" ADD CONSTRAINT "ReadingPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingPathEntry" ADD CONSTRAINT "ReadingPathEntry_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "ReadingPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingPathEntry" ADD CONSTRAINT "ReadingPathEntry_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingPathFollow" ADD CONSTRAINT "ReadingPathFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingPathFollow" ADD CONSTRAINT "ReadingPathFollow_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "ReadingPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
