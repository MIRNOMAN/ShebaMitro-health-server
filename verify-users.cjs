const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Verifying and configuring accounts in backend database ---');

  const defaultPassword = 'Password123!';
  const passwordHash = await argon2.hash(defaultPassword);

  const accounts = [
    {
      email: 'patient@shebamitro.health',
      role: 'PATIENT',
      name: 'Rahim Ahmed (Patient)',
      phone: '+8801700000001',
      profileType: 'patient',
    },
    {
      email: 'doctor@shebamitro.health',
      role: 'DOCTOR',
      name: 'Dr. Tanzil Rahman',
      phone: '+8801700000002',
      profileType: 'doctor',
    },
    {
      email: 'pharmacy@shebamitro.health',
      role: 'PHARMACY',
      name: 'Lazz Pharma (Dhanmondi)',
      phone: '+8801700000003',
      profileType: 'pharmacy',
    },
    {
      email: 'lab@shebamitro.health',
      role: 'LAB',
      name: 'Popular Diagnostic Centre',
      phone: '+8801700000004',
      profileType: 'lab',
    },
  ];

  for (const acc of accounts) {
    let user = await prisma.user.findUnique({
      where: { email: acc.email },
      include: {
        patientProfile: true,
        doctorProfile: true,
        pharmacyProfile: true,
        labProfile: true,
      },
    });

    if (user) {
      console.log(`Updating existing user: ${acc.email} (${acc.role})`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          role: acc.role,
          passwordHash,
          name: user.name || acc.name,
        },
        include: {
          patientProfile: true,
          doctorProfile: true,
          pharmacyProfile: true,
          labProfile: true,
        },
      });
    } else {
      console.log(`Creating new user: ${acc.email} (${acc.role})`);
      // Check phone clash if any
      const existingPhone = await prisma.user.findUnique({
        where: { phone: acc.phone },
      });
      const phoneToUse = existingPhone ? null : acc.phone;

      user = await prisma.user.create({
        data: {
          email: acc.email,
          phone: phoneToUse,
          name: acc.name,
          role: acc.role,
          passwordHash,
          isVerified: true,
          failedLoginAttempts: 0,
        },
        include: {
          patientProfile: true,
          doctorProfile: true,
          pharmacyProfile: true,
          labProfile: true,
        },
      });
    }

    // Ensure respective profile exists
    if (acc.profileType === 'patient' && !user.patientProfile) {
      await prisma.patientProfile.create({
        data: {
          userId: user.id,
          bloodGroup: 'B+',
          gender: 'MALE',
          dob: new Date('1995-05-15'),
          emergencyContact: '+8801711223344',
        },
      });
      console.log(`Created PatientProfile for ${acc.email}`);
    }

    if (acc.profileType === 'doctor' && !user.doctorProfile) {
      const regNo = `BMDC-A${Math.floor(10000 + Math.random() * 90000)}`;
      await prisma.doctorProfile.create({
        data: {
          userId: user.id,
          name: user.name || acc.name,
          bmdcRegNo: regNo,
          specialization: 'Internal Medicine',
          qualifications: ['MBBS', 'FCPS (Medicine)', 'MRCP (UK)'],
          experienceYears: 8,
          consultFee: 800,
          followUpFee: 400,
          isApproved: true,
          hospital: 'Dhaka Medical College Hospital',
          rating: 4.9,
          reviewCount: 38,
        },
      });
      console.log(`Created DoctorProfile for ${acc.email} (Approved: true)`);
    } else if (acc.profileType === 'doctor' && user.doctorProfile && !user.doctorProfile.isApproved) {
      await prisma.doctorProfile.update({
        where: { id: user.doctorProfile.id },
        data: { isApproved: true },
      });
      console.log(`Approved DoctorProfile for ${acc.email}`);
    }

    if (acc.profileType === 'pharmacy' && !user.pharmacyProfile) {
      const license = `DGDA-DL-${Math.floor(10000 + Math.random() * 90000)}`;
      await prisma.pharmacyProfile.create({
        data: {
          userId: user.id,
          tradeName: user.name || acc.name,
          drugLicenseNo: license,
          address: 'House 42, Road 7, Dhanmondi, Dhaka',
          deliveryAvailable: true,
        },
      });
      console.log(`Created PharmacyProfile for ${acc.email}`);
    }

    if (acc.profileType === 'lab' && !user.labProfile) {
      const license = `DGHS-LAB-${Math.floor(10000 + Math.random() * 90000)}`;
      await prisma.labProfile.create({
        data: {
          userId: user.id,
          labName: user.name || acc.name,
          licenseNo: license,
          address: 'House 16, Road 2, Dhanmondi, Dhaka',
          testsOffered: ['Complete Blood Count', 'Lipid Profile', 'HbA1c', 'Liver Function Test', 'Serum Creatinine'],
          accreditation: 'ISO 15189 Accredited',
        },
      });
      console.log(`Created LabProfile for ${acc.email}`);
    }

    console.log(` Verified: ${acc.email} | Role: ${acc.role} | isVerified: true | Password: ${defaultPassword}`);
  }

  console.log('--- All 4 accounts are verified and ready for login! ---');
}

main()
  .catch((e) => {
    console.error('Error during verification:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
