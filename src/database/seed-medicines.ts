import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const COMPREHENSIVE_MEDICINES = [
  // FEVER, PAIN & ANALGESICS
  {
    name: 'Napa Extra',
    genericName: 'Paracetamol + Caffeine',
    manufacturer: 'Beximco Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '500mg + 65mg',
    packSize: '10 Tablets / Strip',
    price: 30,
    originalPrice: 35,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 250,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Fast acting fever and headache relief formulated with pure paracetamol and caffeine booster.',
    dosageGuidance:
      '1 to 2 tablets every 4 to 6 hours as needed. Do not exceed 8 tablets in 24 hours.',
  },
  {
    name: 'Ace Plus',
    genericName: 'Paracetamol + Caffeine',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '500mg + 65mg',
    packSize: '10 Tablets / Strip',
    price: 28,
    originalPrice: 32,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 300,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'High efficacy paracetamol combined with caffeine for accelerated relief of fever, headache, and body aches.',
    dosageGuidance:
      '1-2 tablets every 4-6 hours. Maximum 8 tablets in 24 hours.',
  },
  {
    name: 'Napa One',
    genericName: 'Paracetamol',
    manufacturer: 'Beximco Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '1000mg',
    packSize: '10 Tablets / Strip',
    price: 35,
    originalPrice: 40,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 180,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      '1000mg rapid release paracetamol with actizorb technology for high fever and severe joint pain.',
    dosageGuidance: '1 tablet every 6 to 8 hours as needed.',
  },
  {
    name: 'Fast 500',
    genericName: 'Paracetamol',
    manufacturer: 'Acme Laboratories Ltd.',
    type: 'Tablet',
    strength: '500mg',
    packSize: '10 Tablets / Strip',
    price: 15,
    originalPrice: 18,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 400,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Cost-effective high-purity paracetamol for everyday fever, cold, and pain relief.',
    dosageGuidance: '1 to 2 tablets every 4 to 6 hours after meals.',
  },

  // GASTRIC, PPI & DIGESTIVE CARE
  {
    name: 'Seclo 20',
    genericName: 'Omeprazole',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Capsule',
    strength: '20mg',
    packSize: '14 Capsules / Strip',
    price: 84,
    originalPrice: 95,
    category: 'digestive',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 180,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Proton-pump inhibitor that decreases the amount of acid produced in the stomach for GERD & peptic ulcers.',
    dosageGuidance:
      '1 capsule morning and 1 night before meals (30 minutes prior).',
  },
  {
    name: 'Maxpro 20',
    genericName: 'Esomeprazole Magnesium',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '20mg',
    packSize: '10 Tablets / Strip',
    price: 90,
    originalPrice: 100,
    category: 'digestive',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 210,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Advanced S-enantiomer PPI for hyperacidity, erosive esophagitis, and long-lasting gastric relief.',
    dosageGuidance: '1 tablet daily 30 minutes before breakfast.',
  },
  {
    name: 'Sergel 20',
    genericName: 'Esomeprazole Magnesium',
    manufacturer: 'Healthcare Pharmaceuticals Ltd.',
    type: 'Capsule',
    strength: '20mg',
    packSize: '14 Capsules / Strip',
    price: 98,
    originalPrice: 112,
    category: 'digestive',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 160,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Targeted therapeutic acid suppression for gastroesophageal reflux and ulcer healing.',
    dosageGuidance: '1 capsule twice daily before meals.',
  },
  {
    name: 'Pantonix 20',
    genericName: 'Pantoprazole Sodium',
    manufacturer: 'Incepta Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '20mg',
    packSize: '14 Tablets / Strip',
    price: 98,
    originalPrice: 110,
    category: 'digestive',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 190,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Targeted proton-pump inhibitor for acid reflux, chronic heartburn, and stomach ulcer protection.',
    dosageGuidance: '1 tablet 30 minutes before breakfast daily.',
  },
  {
    name: 'Omidon 10',
    genericName: 'Domperidone',
    manufacturer: 'Incepta Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '10mg',
    packSize: '10 Tablets / Strip',
    price: 35,
    originalPrice: 40,
    category: 'digestive',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 220,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Effective antiemetic and gastroprokinetic agent for nausea, vomiting, fullness, and bloating.',
    dosageGuidance: '1 tablet 15-30 minutes before meals 3 times daily.',
  },

  // COUGH, ALLERGY & RESPIRATORY
  {
    name: 'Tusca Syrup',
    genericName: 'Dextromethorphan + Guaiphenesin',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Syrup',
    strength: '100ml',
    packSize: '1 Bottle',
    price: 110,
    originalPrice: 125,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 95,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Cough suppressant and expectorant syrup for relieving chest congestion and productive cough.',
    dosageGuidance: '2 teaspoonfuls (10ml) 3 times daily after meals.',
  },
  {
    name: 'Alatrol 10',
    genericName: 'Cetirizine Dihydrochloride',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '10mg',
    packSize: '10 Tablets / Strip',
    price: 35,
    originalPrice: 40,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 280,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Fast acting anti-allergic medication for running nose, allergic rhinitis, sneezing, and skin itching.',
    dosageGuidance: '1 tablet daily at bedtime.',
  },
  {
    name: 'Montene 10',
    genericName: 'Montelukast Sodium',
    manufacturer: 'Incepta Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '10mg',
    packSize: '15 Tablets / Strip',
    price: 240,
    originalPrice: 270,
    category: 'pain',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 120,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Leukotriene receptor antagonist for prophylaxis and chronic treatment of asthma & allergic rhinitis.',
    dosageGuidance: '1 tablet once daily at evening/bedtime.',
  },
  {
    name: 'Monas 10',
    genericName: 'Montelukast Sodium',
    manufacturer: 'Acme Laboratories Ltd.',
    type: 'Tablet',
    strength: '10mg',
    packSize: '15 Tablets / Strip',
    price: 230,
    originalPrice: 260,
    category: 'pain',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 130,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Proven leukotriene inhibitor for bronchodilation, nocturnal asthma prevention, and seasonal allergies.',
    dosageGuidance: '1 tablet once daily in the evening.',
  },
  {
    name: 'Fexo 120',
    genericName: 'Fexofenadine Hydrochloride',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '120mg',
    packSize: '10 Tablets / Strip',
    price: 90,
    originalPrice: 100,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 210,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Non-drowsy 2nd generation antihistamine for relief of allergic rhinitis, sneezing, and hives.',
    dosageGuidance: '1 tablet daily with a full glass of water.',
  },

  // ANTIBIOTICS
  {
    name: 'Azithrocin 500',
    genericName: 'Azithromycin Monohydrate',
    manufacturer: 'Beximco Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '500mg',
    packSize: '6 Tablets / Box',
    price: 210,
    originalPrice: 230,
    category: 'antibiotic',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 80,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Broad-spectrum macrolide antibiotic used for respiratory infections, skin infections, and throat ailments.',
    dosageGuidance:
      '1 tablet once daily 1 hour before or 2 hours after meals for 3 to 5 days.',
  },
  {
    name: 'Cef-3 200',
    genericName: 'Cefixime Trihydrate',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Capsule',
    strength: '200mg',
    packSize: '8 Capsules / Box',
    price: 280,
    originalPrice: 320,
    category: 'antibiotic',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 95,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Third-generation cephalosporin antibiotic for typhoid, severe respiratory tract, and urinary infections.',
    dosageGuidance: '1 capsule every 12 hours after meals for 7 to 10 days.',
  },
  {
    name: 'Ciprocin 500',
    genericName: 'Ciprofloxacin',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '500mg',
    packSize: '10 Tablets / Strip',
    price: 180,
    originalPrice: 200,
    category: 'antibiotic',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 90,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Fluoroquinolone antibiotic for bacterial urinary tract, gastrointestinal, and respiratory infections.',
    dosageGuidance: '1 tablet every 12 hours after meals.',
  },

  // VITAMINS, MINERALS & HYDRATION
  {
    name: 'Ceevit 250',
    genericName: 'Ascorbic Acid (Vitamin C)',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Chewable Tablet',
    strength: '250mg',
    packSize: '20 Tablets / Container',
    price: 45,
    originalPrice: 50,
    category: 'vitamins',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 350,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Tasty chewable vitamin C for immune system boost, wound healing, and collagen synthesis.',
    dosageGuidance: '1 to 2 chewable tablets daily.',
  },
  {
    name: 'Bextrum Gold',
    genericName: 'Multivitamin + Multimineral A-Z',
    manufacturer: 'Beximco Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: 'Daily Formula',
    packSize: '30 Tablets / Container',
    price: 350,
    originalPrice: 400,
    category: 'vitamins',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 150,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Complete daily nutritional support with 30 essential vitamins, minerals, and lutein antioxidants.',
    dosageGuidance:
      '1 tablet once daily with food or as directed by a healthcare professional.',
  },
  {
    name: 'Calbo-D',
    genericName: 'Calcium Carbonate + Vitamin D3',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '500mg + 200 IU',
    packSize: '30 Tablets / Box',
    price: 210,
    originalPrice: 240,
    category: 'vitamins',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 160,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Synergistic calcium and vitamin D3 formulation to support bone density, prevent osteoporosis, and combat fatigue.',
    dosageGuidance: '1 tablet once or twice daily with plenty of water.',
  },
  {
    name: 'ORS Oral Saline',
    genericName: 'Oral Rehydration Salts',
    manufacturer: 'SMC Enterprise Ltd.',
    type: 'Powder',
    strength: 'Sachet 500ml',
    packSize: '10 Sachets / Box',
    price: 60,
    originalPrice: 70,
    category: 'pain',
    requiresPrescription: false,
    inStock: true,
    stockQuantity: 500,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'WHO recommended formula for restoring electrolytes and fluid balance during fever, diarrhea, and dehydration.',
    dosageGuidance:
      'Dissolve 1 sachet completely in 500ml pure drinking water. Drink throughout the day.',
  },

  // DIABETES & CARDIOVASCULAR
  {
    name: 'Metfo 850',
    genericName: 'Metformin Hydrochloride',
    manufacturer: 'Renata Limited',
    type: 'Tablet',
    strength: '850mg',
    packSize: '20 Tablets / Strip',
    price: 120,
    originalPrice: 140,
    category: 'diabetic',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 300,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'First-line medication for the treatment of type 2 diabetes mellitus, especially in overweight individuals.',
    dosageGuidance:
      '1 tablet twice daily with meals to reduce gastrointestinal side effects.',
  },
  {
    name: 'Combit 50/500',
    genericName: 'Vildagliptin + Metformin Hydrochloride',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '50mg + 500mg',
    packSize: '20 Tablets / Box',
    price: 360,
    originalPrice: 400,
    category: 'diabetic',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 110,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Dual action DPP-4 inhibitor plus biguanide for robust glycemic control in type 2 diabetes.',
    dosageGuidance: '1 tablet morning and 1 tablet evening with food.',
  },
  {
    name: 'Angilock 50',
    genericName: 'Losartan Potassium',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '50mg',
    packSize: '30 Tablets / Box',
    price: 210,
    originalPrice: 240,
    category: 'cardiac',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 110,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Angiotensin II receptor antagonist used primarily in high blood pressure and diabetic nephropathy.',
    dosageGuidance: '1 tablet daily at the same time each morning or night.',
  },
  {
    name: 'Bizoran 5/20',
    genericName: 'Amlodipine + Olmesartan Medoxomil',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '5mg + 20mg',
    packSize: '30 Tablets / Box',
    price: 330,
    originalPrice: 375,
    category: 'cardiac',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 85,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Fixed-dose combination calcium channel blocker and ARB for resistant or moderate-to-severe hypertension.',
    dosageGuidance: '1 tablet once daily, with or without food.',
  },
  {
    name: 'Cardizem 30',
    genericName: 'Diltiazem Hydrochloride',
    manufacturer: 'Square Pharmaceuticals Ltd.',
    type: 'Tablet',
    strength: '30mg',
    packSize: '30 Tablets / Box',
    price: 150,
    originalPrice: 165,
    category: 'cardiac',
    requiresPrescription: true,
    inStock: true,
    stockQuantity: 75,
    imageUrl:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
    description:
      'Calcium channel blocker used to manage hypertension, angina pectoris, and arrhythmia.',
    dosageGuidance:
      'As prescribed by cardiologist. Standard: 1 tablet 3 times daily before meals.',
  },
];

async function seedMedicines() {
  console.log(
    `Seeding ${COMPREHENSIVE_MEDICINES.length} medicines into database...`,
  );
  for (const item of COMPREHENSIVE_MEDICINES) {
    const existing = await prisma.medicine.findFirst({
      where: { name: item.name },
    });
    if (!existing) {
      await prisma.medicine.create({ data: item });
      console.log(` Created medicine: ${item.name}`);
    } else {
      await prisma.medicine.update({
        where: { id: existing.id },
        data: item,
      });
      console.log(` Updated medicine: ${item.name}`);
    }
  }
  console.log('✅ Dynamic medicines catalog seeded successfully!');
}

seedMedicines()
  .catch((e) => {
    console.error('Error seeding medicines:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
