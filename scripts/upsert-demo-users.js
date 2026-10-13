const { PrismaClient, Role } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function upsertDemoUsers() {
  console.log('--- Upserting Demo Healthcare Roles ---');
  const password = 'Password123!';
  const passwordHash = await argon2.hash(password);

  const rolesData = [
    {
      email: 'admin@shebamitro.health',
      name: 'System Administrator',
      phone: '+8801700000001',
      role: Role.ADMIN,
      profile: null,
    },
    {
      email: 'patient@shebamitro.health',
      name: 'Tanvir Ahmed (Patient)',
      phone: '+8801711111111',
      role: Role.PATIENT,
      profile: {
        type: 'patient',
        data: {
          bloodGroup: 'B+',
          dob: new Date('1994-06-12'),
          gender: 'Male',
          emergencyContact: '+8801711111199',
          medicalAllergies: ['Dust', 'Pollen'],
        },
      },
    },
    {
      email: 'doctor@shebamitro.health',
      name: 'Prof. Dr. Mahmudul Hasan',
      phone: '+8801722222222',
      role: Role.DOCTOR,
      profile: {
        type: 'doctor',
        data: {
          bmdcRegNo: 'A-98765',
          specialization: 'Internal Medicine & Cardiology',
          qualifications: ['MBBS (DMC)', 'FCPS (Medicine)', 'MD (Cardiology)'],
          experienceYears: 15,
          consultFee: 1500,
          followUpFee: 800,
          isApproved: true,
          bio: 'Senior Clinical Specialist with 15+ years experience in internal medicine and telemedicine care.',
          rating: 4.95,
          reviewCount: 240,
        },
      },
    },
    {
      email: 'pharmacy@shebamitro.health',
      name: 'Sheba Express Model Pharmacy',
      phone: '+8801733333333',
      role: Role.PHARMACY,
      profile: {
        type: 'pharmacy',
        data: {
          drugLicenseNo: 'DRUG-DHK-55443',
          tradeName: 'Sheba Express Model Pharmacy (Dhanmondi Branch)',
          address: 'Road 8/A, Dhanmondi, Dhaka 1209',
          deliveryAvailable: true,
        },
      },
    },
    {
      email: 'lab@shebamitro.health',
      name: 'Sheba Central Diagnostic Lab',
      phone: '+8801744444444',
      role: Role.LAB,
      profile: {
        type: 'lab',
        data: {
          licenseNo: 'LAB-DHK-99881',
          labName: 'Sheba Central Diagnostic & Pathology Center',
          address: 'House 42, Satmasjid Road, Dhanmondi, Dhaka 1205',
          testsOffered: [
            'Complete Blood Count (CBC)',
            'Lipid Profile',
            'HbA1c Blood Sugar',
            'Renal Function Test (RFT)',
            'Thyroid Function (TSH)',
          ],
        },
      },
    },
  ];

  for (const item of rolesData) {
    const existing = await prisma.user.findUnique({
      where: { email: item.email },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          phone: item.phone,
          passwordHash,
          role: item.role,
          isVerified: true,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
      console.log(`✓ Updated user: ${item.email} (${item.role})`);
    } else {
      user = await prisma.user.create({
        data: {
          email: item.email,
          name: item.name,
          phone: item.phone,
          passwordHash,
          role: item.role,
          isVerified: true,
        },
      });
      console.log(`✓ Created user: ${item.email} (${item.role})`);
    }

    // Attach profile if needed
    if (item.profile) {
      if (item.profile.type === 'patient') {
        await prisma.patientProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...item.profile.data },
          update: item.profile.data,
        });
      } else if (item.profile.type === 'doctor') {
        await prisma.doctorProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...item.profile.data },
          update: item.profile.data,
        });
      } else if (item.profile.type === 'pharmacy') {
        await prisma.pharmacyProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...item.profile.data },
          update: item.profile.data,
        });
      } else if (item.profile.type === 'lab') {
        await prisma.labProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...item.profile.data },
          update: item.profile.data,
        });
      }
    }
  }

  console.log('\n--- All demo role users successfully created and verified! ---');
}

upsertDemoUsers()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
