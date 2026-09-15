-- AlterTable
ALTER TABLE "CustomShelf" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareVersion" INTEGER NOT NULL DEFAULT 0;
