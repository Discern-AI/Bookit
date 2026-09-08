-- AlterTable
ALTER TABLE "Edition" ADD COLUMN     "editionTitle" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "metadataUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "openLibraryId" TEXT,
ADD COLUMN     "translators" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "Edition_openLibraryId_key" ON "Edition"("openLibraryId");
