import { PrismaClient, Role, AppointmentType, AppointmentStatus, PaymentStatus, MealTiming } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed with 10 dummy providers across all roles...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Clear existing records safely in order of dependency
  await prisma.medicineReminder.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.labOrder.deleteMany();
  await prisma.pharmacyOrder.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorAvailability.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.labProfile.deleteMany();
  await prisma.pharmacyProfile.deleteMany();
  await prisma.user.deleteMany();

  // 1 & 2: Admins (2)
  console.log(' Creating Admin users...');
  await prisma.user.create({
    data: {
      email: 'system.admin@shebamitro.com',
      phone: '+8801700000001',
      passwordHash,
      role: Role.ADMIN,
      isVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      email: 'ops.admin@shebamitro.com',
      phone: '+8801700000002',
      passwordHash,
      role: Role.ADMIN,
      isVerified: true,
    },
  });

  // 3 & 4: Patients (2)
  console.log(' Creating Patient users and profiles...');
  const patient1User = await prisma.user.create({
    data: {
      email: 'rahim.patient@gmail.com',
      phone: '+8801811112221',
      passwordHash,
      role: Role.PATIENT,
      isVerified: true,
      patientProfile: {
        create: {
          bloodGroup: 'A+',
          dob: new Date('1992-05-15'),
          gender: 'Male',
          emergencyContact: '+8801811112299',
          medicalAllergies: ['Penicillin', 'Dust'],
        },
      },
    },
    include: { patientProfile: true },
  });

  await prisma.user.create({
    data: {
      email: 'fatema.patient@gmail.com',
      phone: '+8801811112222',
      passwordHash,
      role: Role.PATIENT,
      isVerified: true,
      patientProfile: {
        create: {
          bloodGroup: 'O+',
          dob: new Date('1995-09-20'),
          gender: 'Female',
          emergencyContact: '+8801811112298',
          medicalAllergies: ['Pollen'],
        },
      },
    },
  });

  // 5 & 6: Doctors (2)
  console.log(' Creating Doctor users, profiles, and availabilities...');
  const doctor1User = await prisma.user.create({
    data: {
      email: 'dr.noman@shebamitro.com',
      phone: '+8801922223331',
      passwordHash,
      role: Role.DOCTOR,
      isVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNo: 'A-89412',
          specialization: 'Cardiology',
          qualifications: ['MBBS (DMC)', 'FCPS (Cardiology)', 'MD'],
          experienceYears: 12,
          consultFee: 1200.0,
          followUpFee: 600.0,
          isApproved: true,
          bio: 'Senior Consultant Cardiologist specializing in interventional cardiology and preventive care.',
          rating: 4.9,
          reviewCount: 128,
          availabilities: {
            create: [
              { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30 },
              { dayOfWeek: 'WEDNESDAY', startTime: '14:00', endTime: '18:00', slotDurationMinutes: 30 },
            ],
          },
        },
      },
    },
    include: { doctorProfile: true },
  });

  await prisma.user.create({
    data: {
      email: 'dr.anjuman@shebamitro.com',
      phone: '+8801922223332',
      passwordHash,
      role: Role.DOCTOR,
      isVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNo: 'A-76129',
          specialization: 'Pediatrics',
          qualifications: ['MBBS (SSMC)', 'DCH (DU)', 'FCPS (Pediatrics)'],
          experienceYears: 9,
          consultFee: 1000.0,
          followUpFee: 500.0,
          isApproved: true,
          bio: 'Compassionate Pediatrician dedicated to child growth and developmental healthcare.',
          rating: 4.8,
          reviewCount: 94,
          availabilities: {
            create: [
              { dayOfWeek: 'TUESDAY', startTime: '10:00', endTime: '14:00', slotDurationMinutes: 30 },
              { dayOfWeek: 'THURSDAY', startTime: '15:00', endTime: '19:00', slotDurationMinutes: 30 },
            ],
          },
        },
      },
    },
  });

  // 7 & 8: Labs (2)
  console.log(' Creating Lab users and profiles...');
  await prisma.user.create({
    data: {
      email: 'info@populardiagnostics.com',
      phone: '+8801633334441',
      passwordHash,
      role: Role.LAB,
      isVerified: true,
      labProfile: {
        create: {
          licenseNo: 'LAB-DHK-2024-001',
          labName: 'Popular Diagnostic & Testing Center',
          address: 'House 16, Road 2, Dhanmondi, Dhaka 1205',
          testsOffered: [
            'Complete Blood Count (CBC)',
            'Lipid Profile',
            'HbA1c',
            'Echo Cardiogram',
            'MRI Brain Scan',
          ],
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      email: 'contact@ibnsinadiagnostics.com',
      phone: '+8801633334442',
      passwordHash,
      role: Role.LAB,
      isVerified: true,
      labProfile: {
        create: {
          licenseNo: 'LAB-DHK-2024-002',
          labName: 'Ibn Sina Specialized Diagnostic Lab',
          address: 'House 68, Road 15/A, Dhanmondi R/A, Dhaka 1209',
          testsOffered: [
            'Liver Function Test (LFT)',
            'Renal Function Test (RFT)',
            'Thyroid Profile (T3, T4, TSH)',
            'RT-PCR Test',
          ],
        },
      },
    },
  });

  // 9 & 10: Pharmacies (2)
  console.log(' Creating Pharmacy users and profiles...');
  await prisma.user.create({
    data: {
      email: 'order@lazzpharma.com',
      phone: '+8801544445551',
      passwordHash,
      role: Role.PHARMACY,
      isVerified: true,
      pharmacyProfile: {
        create: {
          drugLicenseNo: 'DRUG-DHK-99812',
          tradeName: 'Lazz Pharma (Kalabagan Branch)',
          address: 'Kalabagan Bus Stand, Mirpur Road, Dhaka 1205',
          deliveryAvailable: true,
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      email: 'support@tamanna-pharmacy.com',
      phone: '+8801544445552',
      passwordHash,
      role: Role.PHARMACY,
      isVerified: true,
      pharmacyProfile: {
        create: {
          drugLicenseNo: 'DRUG-DHK-88713',
          tradeName: 'Tamanna Pharmacy & Medicine Store',
          address: 'Plot 4, Main Road, Banani, Dhaka 1213',
          deliveryAvailable: true,
        },
      },
    },
  });

  // Seed sample appointment & prescription
  if (doctor1User.doctorProfile && patient1User.patientProfile) {
    console.log(' Creating sample appointment and prescription...');
    const slotStart = new Date();
    slotStart.setHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor1User.doctorProfile.id,
        patientId: patient1User.patientProfile.id,
        slotStartTime: slotStart,
        slotEndTime: slotEnd,
        type: AppointmentType.ONLINE,
        status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        meetingRoomId: 'room-cardiology-101',
        notes: 'Routine cardiovascular checkup and ECG review.',
      },
    });

    await prisma.prescription.create({
      data: {
        appointmentId: appointment.id,
        doctorId: doctor1User.doctorProfile.id,
        patientId: patient1User.patientProfile.id,
        diagnosis: 'Essential Hypertension',
        chiefComplaints: 'Occasional dizziness and high BP reading',
        vitalsJson: { bp: '140/90', pulse: 78, weightKg: 72 },
        advice: 'Reduce sodium intake, 30 min daily brisk walking.',
        qrCodeHash: 'qr_hash_abc123xyz',
        pdfUrl: 'https://cdn.shebamitro.com/prescriptions/rx_101.pdf',
        items: {
          create: [
            {
              medicineName: 'Seclo 20mg',
              genericName: 'Omeprazole',
              dosageForm: 'Capsule',
              schedulePattern: '1+0+1',
              mealTiming: MealTiming.BEFORE_MEAL,
              durationDays: 14,
            },
            {
              medicineName: 'Amlodin 5mg',
              genericName: 'Amlodipine',
              dosageForm: 'Tablet',
              schedulePattern: '0+0+1',
              mealTiming: MealTiming.AFTER_MEAL,
              durationDays: 30,
            },
          ],
        },
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
