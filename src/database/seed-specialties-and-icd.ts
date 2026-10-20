import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INITIAL_SPECIALTIES = [
  {
    code: 'cardiology',
    titleEn: 'Cardiology',
    titleBn: 'হৃদরোগ (কার্ডিওলজি)',
    icon: 'HeartPulse',
    gradient: 'from-primary-teal to-emerald-accent',
    badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
    description: 'Expert consultation for heart diseases, hypertension, chest pain, and cardiovascular health.',
    keywords: ['cardio', 'heart', 'কার্ডিওলজি', 'ecg', 'blood pressure'],
  },
  {
    code: 'neurology',
    titleEn: 'Neurology',
    titleBn: 'স্নায়ুরোগ (নিউরোালজি)',
    icon: 'Brain',
    gradient: 'from-violet-accent to-primary-teal',
    badgeColor: 'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
    description: 'Comprehensive neurological evaluation for stroke, epilepsy, migraine, and neuropathy.',
    keywords: ['neuro', 'brain', 'স্নায়ু', 'স্ট্রোক', 'মস্তিষ্ক'],
  },
  {
    code: 'pediatrics',
    titleEn: 'Pediatrics',
    titleBn: 'শিশু স্বাস্থ্য (পিডিয়াট্রিক্স)',
    icon: 'Baby',
    gradient: 'from-coral-accent to-violet-accent',
    badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
    description: 'Child health, immunization, newborn care, growth monitoring, and pediatric illness.',
    keywords: ['pediatric', 'child', 'শিশু', 'পিডিয়া', 'নবজাতক'],
  },
  {
    code: 'orthopedics',
    titleEn: 'Orthopedics',
    titleBn: 'অস্থিরোগ (অর্থোপেডিক্স)',
    icon: 'Bone',
    gradient: 'from-emerald-accent to-primary-teal',
    badgeColor: 'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
    description: 'Bone fractures, joint pain, spine disorders, arthritis, and orthopedic surgery.',
    keywords: ['ortho', 'bone', 'অর্থোপেডিক', 'হাড়', 'জয়েন্ট পেইন'],
  },
  {
    code: 'dermatology',
    titleEn: 'Dermatology',
    titleBn: 'চর্ম ও যৌনরোগ',
    icon: 'Sparkles',
    gradient: 'from-primary-teal to-violet-accent',
    badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
    description: 'Advanced diagnosis and care for skin allergies, fungal infections, acne, and hair fall.',
    keywords: ['derma', 'skin', 'চর্ম', 'ত্বক', 'এলার্জি'],
  },
  {
    code: 'gynecology',
    titleEn: 'Gynecology',
    titleBn: 'স্ত্রী ও প্রসূতি রোগ',
    icon: 'UserCheck',
    gradient: 'from-coral-accent to-emerald-accent',
    badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
    description: 'Maternal health, pregnancy care, reproductive wellness, and gynecological treatment.',
    keywords: ['gyne', 'obs', 'স্ত্রী', 'প্রসূতি', 'গর্ভকালীন'],
  },
  {
    code: 'ophthalmology',
    titleEn: 'Ophthalmology',
    titleBn: 'চক্ষুরোগ বিশেষজ্ঞ',
    icon: 'Eye',
    gradient: 'from-violet-accent to-emerald-accent',
    badgeColor: 'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
    description: 'Eye checkup, cataract evaluation, glaucoma screening, and vision correction.',
    keywords: ['ophthal', 'eye', 'চক্ষু', 'চোখ'],
  },
  {
    code: 'oncology',
    titleEn: 'Oncology',
    titleBn: 'ক্যান্সার বা অনকোলজি',
    icon: 'ShieldPlus',
    gradient: 'from-primary-teal to-coral-accent',
    badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
    description: 'Specialized cancer diagnostics, chemotherapy guidance, and oncology consultations.',
    keywords: ['onco', 'cancer', 'ক্যান্সার', 'টিউমার'],
  },
  {
    code: 'psychiatry',
    titleEn: 'Psychiatry',
    titleBn: 'মানসিক স্বাস্থ্য ও সাইকিয়াট্রি',
    icon: 'Smile',
    gradient: 'from-emerald-accent to-violet-accent',
    badgeColor: 'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
    description: 'Mental health assessment, anxiety relief, depression treatment, and psychotherapy.',
    keywords: ['psych', 'mental', 'মানসিক', 'ডিপ্রেশন'],
  },
  {
    code: 'ent',
    titleEn: 'ENT Care',
    titleBn: 'ناک, কান ও গলা (ইএনটি)',
    icon: 'Activity',
    gradient: 'from-coral-accent to-primary-teal',
    badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
    description: 'Treatment for ear infections, hearing loss, sinusitis, tonsillitis, and throat disorders.',
    keywords: ['ent', 'ear', 'nose', 'throat', 'কান', 'গলা', 'ناک'],
  },
  {
    code: 'internal-medicine',
    titleEn: 'Internal Medicine',
    titleBn: 'মেডিসিন ও ডায়াবেটিস',
    icon: 'Stethoscope',
    gradient: 'from-primary-teal to-emerald-accent',
    badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
    description: 'Comprehensive adult medicine, diabetes management, chronic diseases, and fever diagnosis.',
    keywords: ['medicine', 'internal', 'ডায়াবেটিস', 'মেডিসিন', 'জ্বর'],
  },
];

const INITIAL_ICD10 = [
  {
    code: 'I10',
    diagnosisTitle: 'Essential (primary) hypertension',
    category: 'Cardiovascular',
    isChronic: true,
  },
  {
    code: 'E11.9',
    diagnosisTitle: 'Type 2 diabetes mellitus without complications',
    category: 'Endocrine & Metabolic',
    isChronic: true,
  },
  {
    code: 'J45.909',
    diagnosisTitle: 'Unspecified asthma, uncomplicated',
    category: 'Respiratory',
    isChronic: true,
  },
  {
    code: 'M54.5',
    diagnosisTitle: 'Low back pain',
    category: 'Musculoskeletal',
    isChronic: false,
  },
  {
    code: 'K21.9',
    diagnosisTitle: 'Gastro-esophageal reflux disease without esophagitis',
    category: 'Gastrointestinal',
    isChronic: false,
  },
  {
    code: 'G43.909',
    diagnosisTitle: 'Migraine, unspecified, not intractable',
    category: 'Neurological',
    isChronic: false,
  },
  {
    code: 'J06.9',
    diagnosisTitle: 'Acute upper respiratory infection, unspecified',
    category: 'Respiratory / Infectious',
    isChronic: false,
  },
  {
    code: 'E78.5',
    diagnosisTitle: 'Hyperlipidemia, unspecified',
    category: 'Metabolic',
    isChronic: true,
  },
  {
    code: 'N39.0',
    diagnosisTitle: 'Urinary tract infection, site not specified',
    category: 'Genitourinary',
    isChronic: false,
  },
  {
    code: 'F32.9',
    diagnosisTitle: 'Major depressive disorder, single episode, unspecified',
    category: 'Psychiatric / Mental Health',
    isChronic: true,
  },
];

async function main() {
  console.log('🌱 Seeding database Medical Specialties and ICD-10 Diagnoses...');

  // 1. Seed Specialties
  for (const s of INITIAL_SPECIALTIES) {
    await prisma.medicalSpecialty.upsert({
      where: { code: s.code },
      update: {
        titleEn: s.titleEn,
        titleBn: s.titleBn,
        icon: s.icon,
        gradient: s.gradient,
        badgeColor: s.badgeColor,
        description: s.description,
        keywords: s.keywords,
        isActive: true,
      },
      create: {
        code: s.code,
        titleEn: s.titleEn,
        titleBn: s.titleBn,
        icon: s.icon,
        gradient: s.gradient,
        badgeColor: s.badgeColor,
        description: s.description,
        keywords: s.keywords,
        isActive: true,
      },
    });
  }
  console.log(`✅ Seeded ${INITIAL_SPECIALTIES.length} Medical Specialties in database.`);

  // 2. Seed ICD-10
  for (const item of INITIAL_ICD10) {
    await prisma.icd10Diagnosis.upsert({
      where: { code: item.code },
      update: {
        diagnosisTitle: item.diagnosisTitle,
        category: item.category,
        isChronic: item.isChronic,
        isActive: true,
      },
      create: {
        code: item.code,
        diagnosisTitle: item.diagnosisTitle,
        category: item.category,
        isChronic: item.isChronic,
        isActive: true,
      },
    });
  }
  console.log(`✅ Seeded ${INITIAL_ICD10.length} ICD-10 Diagnoses in database.`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding specialties and ICD-10:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
