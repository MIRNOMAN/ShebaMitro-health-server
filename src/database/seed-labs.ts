import { PrismaClient, Role, LabOrderStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DIAGNOSTIC_PACKAGES_SEED = [
  {
    testName: "Executive Full Body Master Checkup",
    category: "full_body",
    description: "Comprehensive 68-parameter screening for total organ wellness, cardiovascular, metabolic, and liver-kidney vitality.",
    sampleType: "Blood & Urine",
    parametersCount: 68,
    price: 3800,
    originalPrice: 6500,
    discountPercentage: 41,
    fastingRequired: true,
    turnaroundHours: 24,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Complete Blood Count (CBC) with ESR (18 parameters)",
      "Lipid Profile (Cholesterol, HDL, LDL, Triglycerides, VLDL)",
      "Liver Function Test (SGPT, SGOT, Bilirubin Total/Direct, Alk Phos)",
      "Kidney Function Test (Serum Creatinine, Blood Urea, Uric Acid, eGFR)",
      "HbA1c Glycated Hemoglobin & Fasting Plasma Glucose",
      "Thyroid Profile (T3, T4, TSH Ultra-sensitive)",
      "Serum Calcium & Uric Acid",
      "Urine Routine & Microscopic Examination (15 parameters)",
    ],
  },
  {
    testName: "Advanced Diabetes Care Profile",
    category: "diabetic",
    description: "Targeted metabolic health panel for diabetic & pre-diabetic patients to track glycemic control, insulin resistance, and kidney filtration.",
    sampleType: "Blood & Urine",
    parametersCount: 42,
    price: 1850,
    originalPrice: 3200,
    discountPercentage: 42,
    fastingRequired: true,
    turnaroundHours: 12,
    labAccreditation: "CAP Accredited & ISO 15189",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "HbA1c (Glycosylated Hemoglobin)",
      "Fasting Blood Sugar (FBS)",
      "Post-Prandial Blood Sugar (PPBS 2hr)",
      "Lipid Profile (Cardiac Risk Ratio)",
      "Serum Creatinine with eGFR calculation",
      "Urine Microalbumin / Creatinine Ratio (Early Nephropathy Screen)",
    ],
  },
  {
    testName: "Comprehensive Cardiac Risk Profile",
    category: "cardiac",
    description: "Gold-standard cardiovascular health screening identifying arterial inflammation, cholesterol fractions, and cardiac stress biomarkers.",
    sampleType: "Blood",
    parametersCount: 38,
    price: 2900,
    originalPrice: 4800,
    discountPercentage: 40,
    fastingRequired: true,
    turnaroundHours: 18,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "High-Sensitivity C-Reactive Protein (hs-CRP)",
      "Lipid Profile (Apolipoprotein A1, Apo-B, Total Cholesterol, HDL, LDL)",
      "Serum Homocysteine (Cardiovascular Thrombosis Risk)",
      "Cardiac Troponin-I High Sensitivity",
      "Serum Electrolytes (Sodium, Potassium, Chloride)",
      "Fasting Blood Sugar & Serum Creatinine",
    ],
  },
  {
    testName: "Women's Wellness & Hormonal Profile",
    category: "women",
    description: "Designed by expert gynecologists to evaluate thyroid health, reproductive hormones, ovarian reserve, anemia, and vital mineral balances.",
    sampleType: "Blood",
    parametersCount: 52,
    price: 3400,
    originalPrice: 5600,
    discountPercentage: 39,
    fastingRequired: true,
    turnaroundHours: 24,
    labAccreditation: "ISO Certified & NABL Standard",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Complete Thyroid Panel (Free T3, Free T4, TSH)",
      "Serum Ferritin & Complete Hemogram (Anemia Evaluation)",
      "Vitamin D3 (25-OH) & Vitamin B12",
      "FSH (Follicle Stimulating Hormone) & LH (Luteinizing Hormone)",
      "Serum Prolactin & Total Testosterone",
      "Calcium, Magnesium & Phosphorus Levels",
    ],
  },
  {
    testName: "Comprehensive Liver & Kidney Function Panel",
    category: "liver_kidney",
    description: "Dual vital organ health checkup assessing hepatic clearance, biliary enzymes, renal filtration rate, and blood waste clearances.",
    sampleType: "Blood & Urine",
    parametersCount: 34,
    price: 2200,
    originalPrice: 3800,
    discountPercentage: 42,
    fastingRequired: false,
    turnaroundHours: 12,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Liver Function Test (LFT) - SGPT, SGOT, Total Bilirubin, Direct Bilirubin",
      "Total Protein, Albumin, Globulin & A/G Ratio",
      "Alkaline Phosphatase (ALP) & Gamma-GT (GGT)",
      "Kidney Function Test (KFT) - Serum Creatinine, Blood Urea Nitrogen (BUN)",
      "Serum Uric Acid & eGFR",
      "Serum Electrolytes (Na+, K+, Cl-)",
    ],
  },
  {
    testName: "Thyroid Panel Ultra (T3, T4, TSH & Anti-TPO)",
    category: "thyroid",
    description: "Detailed endocrine assessment to detect hyperthyroidism, hypothyroidism, Hashimoto thyroiditis, and unexplained weight fluctuation causes.",
    sampleType: "Blood",
    parametersCount: 6,
    price: 1400,
    originalPrice: 2200,
    discountPercentage: 36,
    fastingRequired: false,
    turnaroundHours: 12,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Total Triiodothyronine (T3)",
      "Total Thyroxine (T4)",
      "Free T3 & Free T4",
      "Thyroid Stimulating Hormone (TSH 3rd Gen Ultra)",
      "Anti-Thyroid Peroxidase Antibody (Anti-TPO)",
    ],
  },
  {
    testName: "Fever & Infection Screening Panel",
    category: "infection",
    description: "Rapid acute fever diagnostic panel for Dengue, Typhoid, Malaria, and bacterial/viral inflammatory blood counts with same-day reports.",
    sampleType: "Blood & Urine",
    parametersCount: 28,
    price: 1650,
    originalPrice: 2600,
    discountPercentage: 37,
    fastingRequired: false,
    turnaroundHours: 8,
    labAccreditation: "Govt. Approved & ISO Certified",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1582718188123-e03e0be30739?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "CBC with Differential & Platelet Count (Dengue Monitoring)",
      "Dengue NS1 Antigen (Rapid Serology)",
      "Dengue IgM & IgG Antibodies",
      "Typhoid Widal & Typhidot IgM",
      "Malarial Parasite (MP) Slide & Antigen Test",
      "Urine Routine Examination for Urinary Tract Infection (UTI)",
    ],
  },
  {
    testName: "Essential Vitamin Deficiency Panel (D3 & B12)",
    category: "vitamins",
    description: "Quantifies body stores of bone-strengthening Vitamin D3 and nerve-nourishing Vitamin B12 to eliminate chronic fatigue, bone pain, and brain fog.",
    sampleType: "Blood",
    parametersCount: 8,
    price: 2400,
    originalPrice: 4000,
    discountPercentage: 40,
    fastingRequired: false,
    turnaroundHours: 24,
    labAccreditation: "CAP Accredited & ISO 15189",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1550572017-ed23023e9c40?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Vitamin D Total (25-Hydroxy Vitamin D)",
      "Vitamin B12 (Cyanocobalamin)",
      "Serum Total Calcium & Ionic Calcium",
      "Serum Inorganic Phosphorus",
      "Serum Iron & Total Iron Binding Capacity (TIBC)",
    ],
  },
  {
    testName: "Senior Citizen Special Health Screening (60+)",
    category: "full_body",
    description: "Geriatric-focused comprehensive screening for cardiovascular disease, osteopenia, prostate health (PSA), diabetes, and renal vitality.",
    sampleType: "Blood & Urine",
    parametersCount: 56,
    price: 4200,
    originalPrice: 7200,
    discountPercentage: 42,
    fastingRequired: true,
    turnaroundHours: 24,
    labAccreditation: "JCI International Accredited",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Complete Hemogram with Peripheral Smear",
      "Total Lipid Profile & hs-CRP",
      "Total PSA (Prostate Specific Antigen for Men) or CA-125",
      "HbA1c & Fasting Glucose",
      "Kidney Profile with eGFR & Serum Electrolytes",
      "Liver Profile & Vitamin D3",
      "Urine Microalbumin & Culture/Sensitivity",
    ],
  },
  {
    testName: "Basic Health Checkup (Vital 24 Parameters)",
    category: "full_body",
    description: "Essential wellness package for students and young professionals covering core blood counts, blood sugar, kidney, and cholesterol numbers.",
    sampleType: "Blood",
    parametersCount: 24,
    price: 1200,
    originalPrice: 2000,
    discountPercentage: 40,
    fastingRequired: true,
    turnaroundHours: 12,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Complete Blood Count (CBC - 18 parameters)",
      "Fasting Blood Sugar (FBS)",
      "Serum Creatinine",
      "Total Cholesterol",
      "SGPT (ALT Liver Enzyme)",
      "Blood Grouping & Rh Typing",
    ],
  },
  {
    testName: "PCOS / PCOD Advanced Hormone Panel",
    category: "women",
    description: "Specialized endocrine package diagnosing Polycystic Ovary Syndrome, insulin resistance, hyperandrogenism, and metabolic irregular menses.",
    sampleType: "Blood",
    parametersCount: 18,
    price: 3600,
    originalPrice: 5800,
    discountPercentage: 38,
    fastingRequired: true,
    turnaroundHours: 24,
    labAccreditation: "CAP Accredited & ISO 15189",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "LH (Luteinizing Hormone)",
      "FSH (Follicle Stimulating Hormone)",
      "LH / FSH Ratio",
      "Total & Free Testosterone",
      "Serum Prolactin",
      "Fasting Insulin & Fasting Glucose (HOMA-IR Index)",
      "DHEA-S (Dehydroepiandrosterone Sulfate)",
    ],
  },
  {
    testName: "Complete Blood Count (CBC) with ESR & Peripheral Smear",
    category: "infection",
    description: "Standard foundational hematology test for anemia, bacterial or viral infections, leukemia, and thrombocytopenia.",
    sampleType: "Blood",
    parametersCount: 19,
    price: 450,
    originalPrice: 650,
    discountPercentage: 31,
    fastingRequired: false,
    turnaroundHours: 6,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1615461066841-6116e61058f4?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Hemoglobin (Hb%)",
      "Total RBC & Hematocrit (PCV)",
      "MCV, MCH, MCHC, RDW",
      "Total WBC Count",
      "Differential Count (Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils)",
      "Platelet Count & Mean Platelet Volume (MPV)",
      "Erythrocyte Sedimentation Rate (ESR Westergren)",
    ],
  },
  {
    testName: "Fasting Blood Glucose (FBS) & 2hr PPBS Combo",
    category: "diabetic",
    description: "Standard dual glucose evaluation measuring baseline fasting levels and post-meal sugar clearance efficiency.",
    sampleType: "Blood",
    parametersCount: 4,
    price: 350,
    originalPrice: 500,
    discountPercentage: 30,
    fastingRequired: true,
    turnaroundHours: 4,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Fasting Plasma Glucose (FBS)",
      "2-Hours Post-Prandial Glucose (PPBS)",
      "Urine Sugar Fasting & Post-Meal",
    ],
  },
  {
    testName: "Lipid Profile Complete (Cholesterol, HDL, LDL & TG)",
    category: "cardiac",
    description: "Evaluates good cholesterol, bad cholesterol, triglycerides, and atherogenic ratios to assess heart attack risk.",
    sampleType: "Blood",
    parametersCount: 7,
    price: 750,
    originalPrice: 1100,
    discountPercentage: 32,
    fastingRequired: true,
    turnaroundHours: 8,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Total Cholesterol",
      "High Density Lipoprotein (HDL - Good Cholesterol)",
      "Low Density Lipoprotein (LDL - Bad Cholesterol)",
      "Triglycerides",
      "Very Low Density Lipoprotein (VLDL)",
      "Total Cholesterol / HDL Ratio",
      "LDL / HDL Risk Ratio",
    ],
  },
  {
    testName: "Renal Function Test (RFT) with Serum Electrolytes",
    category: "liver_kidney",
    description: "Monitors kidney filtration capacity, toxic metabolic waste retention, and fluid-electrolyte equilibrium.",
    sampleType: "Blood",
    parametersCount: 8,
    price: 900,
    originalPrice: 1400,
    discountPercentage: 35,
    fastingRequired: false,
    turnaroundHours: 8,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Serum Creatinine",
      "Blood Urea Nitrogen (BUN)",
      "Serum Uric Acid",
      "Estimated GFR (eGFR)",
      "Serum Sodium (Na+)",
      "Serum Potassium (K+)",
      "Serum Chloride (Cl-)",
    ],
  },
  {
    testName: "Liver Function Test (LFT) Standard",
    category: "liver_kidney",
    description: "Evaluates liver inflammation, jaundice, fatty liver disease, and protein synthesizing capability.",
    sampleType: "Blood",
    parametersCount: 9,
    price: 850,
    originalPrice: 1300,
    discountPercentage: 34,
    fastingRequired: false,
    turnaroundHours: 8,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: false,
    imageUrl: "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "SGPT / ALT",
      "SGOT / AST",
      "Serum Bilirubin (Total & Direct)",
      "Alkaline Phosphatase (ALP)",
      "Total Protein",
      "Serum Albumin & Globulin",
      "Albumin / Globulin (A/G) Ratio",
    ],
  },
  {
    testName: "Thyroid Stimulating Hormone (TSH) Ultra-sensitive",
    category: "thyroid",
    description: "Primary screening test to diagnose underactive or overactive thyroid gland functioning.",
    sampleType: "Blood",
    parametersCount: 1,
    price: 450,
    originalPrice: 650,
    discountPercentage: 31,
    fastingRequired: false,
    turnaroundHours: 6,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?q=80&w=600&auto=format&fit=crop",
    parameters: ["3rd Generation Chemiluminescence TSH Assay"],
  },
  {
    testName: "Dengue NS1 Antigen + Complete Blood Count",
    category: "infection",
    description: "First-day acute viral test detecting early dengue antigen and tracking platelet drop warnings.",
    sampleType: "Blood",
    parametersCount: 19,
    price: 750,
    originalPrice: 1100,
    discountPercentage: 32,
    fastingRequired: false,
    turnaroundHours: 4,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1582718188123-e03e0be30739?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Dengue NS1 Rapid Antigen",
      "Platelet Count with Serial Monitoring Advice",
      "Hematocrit (PCV)",
      "WBC Total & Differential",
    ],
  },
  {
    testName: "Vitamin D3 (25-Hydroxy) Quantitative Test",
    category: "vitamins",
    description: "Measures biologically active calcidiol level in serum to treat severe bone weakness and fatigue.",
    sampleType: "Blood",
    parametersCount: 1,
    price: 1500,
    originalPrice: 2400,
    discountPercentage: 37,
    fastingRequired: false,
    turnaroundHours: 12,
    labAccreditation: "CAP Accredited & ISO 15189",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1550572017-ed23023e9c40?q=80&w=600&auto=format&fit=crop",
    parameters: ["Serum 25-OH Vitamin D Total (CLIA Method)"],
  },
  {
    testName: "Antenatal Care (ANC) Pregnancy First Trimester Panel",
    category: "women",
    description: "Standard maternal health package required in early pregnancy for baby safety and maternal health.",
    sampleType: "Blood & Urine",
    parametersCount: 26,
    price: 2800,
    originalPrice: 4500,
    discountPercentage: 38,
    fastingRequired: true,
    turnaroundHours: 18,
    labAccreditation: "ISO 15189 Accredited",
    homeCollectionEligible: true,
    isPopular: true,
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=600&auto=format&fit=crop",
    parameters: [
      "Blood Grouping & Rh Factor",
      "CBC with Hemoglobin & Platelets",
      "Fasting Blood Sugar (FBS)",
      "TSH (Thyroid Stimulating Hormone)",
      "HBsAg (Hepatitis B Screen)",
      "VDRL / Syphilis Screen",
      "HIV 1 & 2 Rapid Antibody",
      "Urine Routine & Culture/Sensitivity",
    ],
  },
];

const PARTNER_LABS_SEED = [
  {
    labName: "Popular Diagnostic Center (Central)",
    licenseNo: "LAB-DHK-2024-POP01",
    address: "House 16, Road 2, Dhanmondi R/A, Dhaka 1205",
    accreditation: "ISO 15189 Accredited • DGDA Certified",
    email: "central@populardiagnostics.com",
    phone: "+8801711223344",
  },
  {
    labName: "Ibn Sina Specialized Diagnostic Lab",
    licenseNo: "LAB-DHK-2024-IBN02",
    address: "House 68, Road 15/A, Dhanmondi, Dhaka 1209",
    accreditation: "Govt. Approved • ISO 9001 Certified",
    email: "dhanmondi@ibnsinadiagnostics.com",
    phone: "+8801822334455",
  },
  {
    labName: "Labaid Diagnostic Laboratory",
    licenseNo: "LAB-DHK-2024-LAB03",
    address: "House 01, Road 04, Dhanmondi, Dhaka 1205",
    accreditation: "ISO 15189 Accredited • NABL Standard",
    email: "info@labaid.com.bd",
    phone: "+8801933445566",
  },
  {
    labName: "Praava Health Diagnostics",
    licenseNo: "LAB-DHK-2024-PRA04",
    address: "Plot 9, Road 17, Block E, Banani, Dhaka 1213",
    accreditation: "CAP Accredited • ISO 15189",
    email: "care@praavahealth.com",
    phone: "+8801644556677",
  },
];

export async function seedLabsAndTests() {
  console.log("🧪 Starting Diagnostic Labs & Lab Tests Seeding...");
  const passwordHash = await argon2.hash("Password123!");

  // 1. Ensure Partner Labs exist
  const labProfiles = [];
  for (const lab of PARTNER_LABS_SEED) {
    let user = await prisma.user.findFirst({
      where: { email: lab.email },
      include: { labProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: lab.email,
          phone: lab.phone,
          passwordHash,
          role: Role.LAB,
          isVerified: true,
          labProfile: {
            create: {
              labName: lab.labName,
              licenseNo: lab.licenseNo,
              address: lab.address,
              accreditation: lab.accreditation,
              testsOffered: [
                "Complete Blood Count",
                "Lipid Profile",
                "HbA1c",
                "Liver Function Test",
                "Thyroid Panel",
                "Urine R/E",
              ],
            },
          },
        },
        include: { labProfile: true },
      });
    }

    if (user.labProfile) {
      labProfiles.push(user.labProfile);
    }
  }

  console.log(` Created/Verified ${labProfiles.length} partner diagnostic labs.`);

  const primaryLab = labProfiles[0]!;

  // 2. Clear old lab tests to ensure pristine dynamic data
  await prisma.labTest.deleteMany({});

  // 3. Insert diagnostic packages and lab tests
  let totalTestsCreated = 0;
  for (let i = 0; i < DIAGNOSTIC_PACKAGES_SEED.length; i++) {
    const pkg = DIAGNOSTIC_PACKAGES_SEED[i]!;
    // Distribute among partner labs
    const assignedLab = labProfiles[i % labProfiles.length] || primaryLab;

    await prisma.labTest.create({
      data: {
        labId: assignedLab.id,
        testName: pkg.testName,
        category: pkg.category,
        description: pkg.description,
        sampleType: pkg.sampleType,
        parameters: pkg.parameters,
        parametersCount: pkg.parametersCount,
        price: pkg.price,
        originalPrice: pkg.originalPrice,
        discountPercentage: pkg.discountPercentage,
        fastingRequired: pkg.fastingRequired,
        turnaroundHours: pkg.turnaroundHours,
        labAccreditation: pkg.labAccreditation,
        homeCollectionEligible: pkg.homeCollectionEligible,
        isPopular: pkg.isPopular,
        imageUrl: pkg.imageUrl,
      },
    });
    totalTestsCreated++;
  }

  console.log(` Successfully seeded ${totalTestsCreated} rich diagnostic packages and lab tests!`);

  // 4. Seed dynamic test LabOrders for dashboards if none exist
  const existingOrders = await prisma.labOrder.count();
  if (existingOrders === 0) {
    let patient = await prisma.patientProfile.findFirst();

    if (!patient) {
      const patientUser = await prisma.user.create({
        data: {
          email: "patient.demo@shebamitro.health",
          phone: "+8801819998877",
          passwordHash,
          role: Role.PATIENT,
          isVerified: true,
          patientProfile: {
            create: {
              bloodGroup: "B+",
              gender: "Male",
              dob: new Date("1990-01-01"),
              emergencyContact: "+8801819998877",
            },
          },
        },
        include: { patientProfile: true },
      });
      patient = patientUser.patientProfile!;
    }

    if (!patient) return;

    console.log(" Seeding dynamic demo LabOrders across workflow statuses...");

    await prisma.labOrder.create({
      data: {
        patientId: patient.id,
        labId: primaryLab.id,
        testNames: ["Executive Full Body Master Checkup", "HbA1c Glycated Hemoglobin"],
        totalFee: 3950,
        status: LabOrderStatus.PENDING,
        sampleCollectionAddress: "House 42, Road 11, Banani, Dhaka 1213",
        sampleCollectionSlot: new Date(Date.now() + 1000 * 60 * 60 * 18),
        notes: "Doorbell #3B. Please call before arriving.",
      },
    });

    await prisma.labOrder.create({
      data: {
        patientId: patient.id,
        labId: primaryLab.id,
        testNames: ["Advanced Diabetes Care Profile"],
        totalFee: 2000,
        status: LabOrderStatus.SAMPLE_COLLECTED,
        sampleCollectionAddress: "Flat 4A, Green Garden Apt, Dhanmondi 27, Dhaka",
        sampleCollectionSlot: new Date(Date.now() - 1000 * 60 * 60 * 2),
        technicianName: "Kamrul Islam, CPT",
        technicianPhone: "+8801722889900",
        technicianLatitude: 23.7548,
        technicianLongitude: 90.3754,
        notes: "Cold chain vacutainer sealed. En-route to lab.",
      },
    });

    await prisma.labOrder.create({
      data: {
        patientId: patient.id,
        labId: primaryLab.id,
        testNames: ["Comprehensive Cardiac Risk Profile"],
        totalFee: 3050,
        status: LabOrderStatus.PROCESSING,
        sampleCollectionAddress: "House 18, Road 4, Sector 7, Uttara, Dhaka",
        sampleCollectionSlot: new Date(Date.now() - 1000 * 60 * 60 * 5),
        technicianName: "Mohammad Arif, CPT",
        technicianPhone: "+8801733990011",
        technicianLatitude: 23.8698,
        technicianLongitude: 90.3984,
        notes: "Centrifuged and analyzed on Roche Cobas 6000.",
      },
    });

    await prisma.labOrder.create({
      data: {
        patientId: patient.id,
        labId: primaryLab.id,
        testNames: ["Complete Blood Count (CBC) with ESR", "Thyroid Panel Ultra"],
        totalFee: 1850,
        status: LabOrderStatus.REPORT_READY,
        sampleCollectionAddress: "House 12, Road 7, Gulshan 1, Dhaka",
        sampleCollectionSlot: new Date(Date.now() - 1000 * 60 * 60 * 24),
        technicianName: "Sayedur Rahman, CPT",
        technicianPhone: "+8801744001122",
        reportPdfUrl: "https://shebamitro.api.mirnoman.com/uploads/sample-lab-report.pdf",
        notes: "Report verified and digitally signed by Chief Pathologist Dr. Niaz Ahmed.",
      },
    });

    console.log(" Successfully created 4 live demo LabOrders!");
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed-labs.ts')) {
  seedLabsAndTests()
    .catch((err) => {
      console.error("Seeding labs failed:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
