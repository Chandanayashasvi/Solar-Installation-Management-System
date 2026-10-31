DO $$
BEGIN
  IF to_regclass('"Enquiry"') IS NOT NULL THEN
    ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "monthlyBill" DOUBLE PRECISION;
    ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "publicSubmissionKey" TEXT;
    ALTER TABLE "Enquiry" ADD COLUMN IF NOT EXISTS "subsidyRequirement" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Enquiry_publicSubmissionKey_key" ON "Enquiry"("publicSubmissionKey");
  END IF;

  IF to_regclass('"Subsidy"') IS NOT NULL THEN
    ALTER TABLE "Subsidy" ALTER COLUMN "stage" SET DEFAULT 'DRAFT';
  END IF;
END
$$;
