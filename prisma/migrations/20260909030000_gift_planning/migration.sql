-- CreateTable
CREATE TABLE "GiftContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tasteNotes" TEXT NOT NULL DEFAULT '',
    "budgetPence" INTEGER,
    "occasions" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftItem" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "priority" TEXT NOT NULL DEFAULT 'might_like',
    "pricePence" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "GiftItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftContact_userId_name_idx" ON "GiftContact"("userId", "name");

-- CreateIndex
CREATE INDEX "GiftItem_workId_idx" ON "GiftItem"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftItem_contactId_workId_key" ON "GiftItem"("contactId", "workId");

-- AddForeignKey
ALTER TABLE "GiftContact" ADD CONSTRAINT "GiftContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftItem" ADD CONSTRAINT "GiftItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "GiftContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftItem" ADD CONSTRAINT "GiftItem_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
