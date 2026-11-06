ALTER TABLE "BookshopOutcome" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ReadingAfternoon" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Earlier builds persisted coordinate-bearing Google Maps URLs despite the UI
-- promising that location was not stored. Remove those URLs during upgrade.
UPDATE "BookshopOutcome" SET "externalUrl" = '' WHERE "externalUrl" <> '';
