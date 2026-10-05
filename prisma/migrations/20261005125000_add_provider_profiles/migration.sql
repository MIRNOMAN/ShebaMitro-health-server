-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bmdc_reg_no" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "consult_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "follow_up_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_no" TEXT NOT NULL,
    "lab_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tests_offered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "drug_license_no" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "delivery_available" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_user_id_key" ON "doctor_profiles"("user_id");
CREATE UNIQUE INDEX "doctor_profiles_bmdc_reg_no_key" ON "doctor_profiles"("bmdc_reg_no");

-- CreateIndex
CREATE UNIQUE INDEX "lab_profiles_user_id_key" ON "lab_profiles"("user_id");
CREATE UNIQUE INDEX "lab_profiles_license_no_key" ON "lab_profiles"("license_no");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_profiles_user_id_key" ON "pharmacy_profiles"("user_id");
CREATE UNIQUE INDEX "pharmacy_profiles_drug_license_no_key" ON "pharmacy_profiles"("drug_license_no");

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_profiles" ADD CONSTRAINT "lab_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_profiles" ADD CONSTRAINT "pharmacy_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
