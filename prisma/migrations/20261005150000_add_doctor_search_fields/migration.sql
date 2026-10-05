-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "name" TEXT,
ADD COLUMN IF NOT EXISTS "hospital" TEXT,
ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- Create pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN pg_trgm indices for fast ILIKE / fuzzy search
CREATE INDEX IF NOT EXISTS "doctor_profiles_name_trgm_idx" ON "doctor_profiles" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "doctor_profiles_bio_trgm_idx" ON "doctor_profiles" USING gin ("bio" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "doctor_profiles_hospital_trgm_idx" ON "doctor_profiles" USING gin ("hospital" gin_trgm_ops);

-- Create B-Tree indices for multi-faceted filters
CREATE INDEX IF NOT EXISTS "doctor_profiles_specialization_idx" ON "doctor_profiles"("specialization");
CREATE INDEX IF NOT EXISTS "doctor_profiles_consult_fee_idx" ON "doctor_profiles"("consult_fee");
CREATE INDEX IF NOT EXISTS "doctor_profiles_rating_idx" ON "doctor_profiles"("rating");
