ALTER TABLE "BookClub" ADD COLUMN "isPair" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "partnerId" TEXT;
ALTER TABLE "BookClub" ADD CONSTRAINT "BookClub_pair_private_check" CHECK (NOT "isPair" OR NOT "isPublic");
