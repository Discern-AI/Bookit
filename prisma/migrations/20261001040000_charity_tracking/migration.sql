CREATE TABLE "CharityCampaign" (
 "challengeId" UUID PRIMARY KEY, "charityName" TEXT NOT NULL, "targetPence" INTEGER, "version" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "CharityCampaign_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "ReadingChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SponsorPledge" (
 "id" UUID PRIMARY KEY, "campaignId" UUID NOT NULL, "label" TEXT NOT NULL, "mode" TEXT NOT NULL,
 "amountPence" INTEGER NOT NULL, "capPence" INTEGER, "receivedPence" INTEGER NOT NULL DEFAULT 0,
 "version" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SponsorPledge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CharityCampaign"("challengeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SponsorPledge_campaignId_createdAt_idx" ON "SponsorPledge"("campaignId","createdAt");
