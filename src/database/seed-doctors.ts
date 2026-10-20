import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ALL_DOCTORS = [
  {
    name: 'Dr. Tanzil Rahman',
    email: 'doctor@shebamitro.health',
    phone: '+8801722222222',
    bmdcRegNo: 'BMDC-A50768',
    specialization: 'Internal Medicine',
    qualifications: ['MBBS (DMC)', 'FCPS (Medicine)', 'MRCP (UK)'],
    experienceYears: 15,
    consultFee: 1200,
    followUpFee: 600,
    hospital: 'Dhaka Medical College Hospital',
    gender: 'male',
    rating: 4.9,
    reviewCount: 185,
    bio: 'Prof. Dr. Tanzil Rahman is a leading Internal Medicine consultant specializing in chronic metabolic disorders, preventive cardiovascular care, and acute adult medical management.',
    days: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Farhana Chowdhury',
    email: 'dr.farhana@shebamitro.health',
    phone: '+8801722222201',
    bmdcRegNo: 'BMDC-A61234',
    specialization: 'Gynecology',
    qualifications: ['MBBS (DMC)', 'FCPS (OBGYN)', 'MS (Gynecology)'],
    experienceYears: 14,
    consultFee: 1400,
    followUpFee: 700,
    hospital: 'Dhaka Medical College Hospital',
    gender: 'female',
    rating: 4.95,
    reviewCount: 230,
    bio: 'Senior Consultant Gynecologist and Obstetrician with extensive clinical experience in high-risk pregnancy management, laparoscopic surgery, and maternal-fetal health.',
    days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Farah Ahmed',
    email: 'dr.farah@shebamitro.health',
    phone: '+8801722222202',
    bmdcRegNo: 'BMDC-A72345',
    specialization: 'Cardiology',
    qualifications: ['MBBS (DMC)', 'FCPS (Cardiology)', 'MD (Cardiology)'],
    experienceYears: 16,
    consultFee: 1500,
    followUpFee: 750,
    hospital: 'National Heart Foundation Hospital & Research Institute',
    gender: 'female',
    rating: 4.9,
    reviewCount: 215,
    bio: 'Consultant Interventional Cardiologist specializing in echocardiography, coronary angiography, hypertension management, and preventive heart care.',
    days: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  },
  {
    name: 'Dr. Nusrat Jahan',
    email: 'dr.nusrat@shebamitro.health',
    phone: '+8801722222203',
    bmdcRegNo: 'BMDC-A83456',
    specialization: 'Pediatrics',
    qualifications: ['MBBS (SSMC)', 'DCH (DU)', 'FCPS (Pediatrics)'],
    experienceYears: 11,
    consultFee: 1000,
    followUpFee: 500,
    hospital: 'Dhaka Shishu (Children) Hospital',
    gender: 'female',
    rating: 4.9,
    reviewCount: 210,
    bio: 'Senior Pediatric Specialist with deep expertise in neonatal intensive care, pediatric infectious diseases, child immunization, and developmental milestones.',
    days: ['SUNDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  },
  {
    name: 'Dr. Sabrina Yasmin',
    email: 'dr.sabrina@shebamitro.health',
    phone: '+8801722222204',
    bmdcRegNo: 'BMDC-A94567',
    specialization: 'Dermatology',
    qualifications: ['MBBS (DMC)', 'DDV (BSMMU)', 'FCPS (Dermatology)'],
    experienceYears: 12,
    consultFee: 1200,
    followUpFee: 600,
    hospital: 'BSMMU (PG Hospital), Dhaka',
    gender: 'female',
    rating: 4.9,
    reviewCount: 180,
    bio: 'Associate Professor & Consultant Dermatologist specialized in clinical dermatology, laser skin procedures, acne management, and autoimmune dermatological conditions.',
    days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Tanvir Hasan',
    email: 'dr.tanvir@shebamitro.health',
    phone: '+8801722222205',
    bmdcRegNo: 'BMDC-A45678',
    specialization: 'Neurology',
    qualifications: ['MBBS (DMC)', 'MD (Neurology)', 'Fellow Stroke Care (Singapore)'],
    experienceYears: 15,
    consultFee: 1600,
    followUpFee: 800,
    hospital: 'National Institute of Neurosciences & Hospital (NINS)',
    gender: 'male',
    rating: 4.95,
    reviewCount: 195,
    bio: 'Associate Professor of Neurology specializing in acute stroke intervention, epilepsy management, Parkinsonism, and peripheral neuropathy disorders.',
    days: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  },
  {
    name: 'Dr. Shahadat Hossain',
    email: 'dr.shahadat@shebamitro.health',
    phone: '+8801722222206',
    bmdcRegNo: 'BMDC-A56789',
    specialization: 'Orthopedics',
    qualifications: ['MBBS (DMC)', 'MS (Orthopedics)', 'Fellow Spine Surgery'],
    experienceYears: 17,
    consultFee: 1400,
    followUpFee: 700,
    hospital: 'National Institute of Traumatology & Orthopedic Rehabilitation (NITOR)',
    gender: 'male',
    rating: 4.85,
    reviewCount: 160,
    bio: 'Senior Orthopedic & Joint Replacement Surgeon with extensive mastery in arthroscopic knee reconstruction, pelvic trauma surgery, and spinal disc treatment.',
    days: ['SATURDAY', 'SUNDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  },
  {
    name: 'Dr. Mahbubur Rahman',
    email: 'dr.mahbub@shebamitro.health',
    phone: '+8801722222207',
    bmdcRegNo: 'BMDC-A67890',
    specialization: 'Ophthalmology',
    qualifications: ['MBBS (DMC)', 'FCPS (Ophthalmology)', 'FICO (UK)'],
    experienceYears: 13,
    consultFee: 1100,
    followUpFee: 500,
    hospital: 'National Institute of Ophthalmology & Hospital, Dhaka',
    gender: 'male',
    rating: 4.85,
    reviewCount: 145,
    bio: 'Consultant Eye Surgeon with fellowship in phacoemulsification, glaucoma filtration surgery, corneal transplantation, and diabetic retinopathy laser therapy.',
    days: ['SUNDAY', 'MONDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Sayeda Akter',
    email: 'dr.sayeda@shebamitro.health',
    phone: '+8801722222208',
    bmdcRegNo: 'BMDC-A78901',
    specialization: 'Psychiatry',
    qualifications: ['MBBS (DMC)', 'FCPS (Psychiatry)', 'MPhil (Psychiatry)'],
    experienceYears: 10,
    consultFee: 1300,
    followUpFee: 650,
    hospital: 'National Institute of Mental Health (NIMH), Dhaka',
    gender: 'female',
    rating: 4.9,
    reviewCount: 130,
    bio: 'Compassionate Consultant Psychiatrist focused on adult psychotherapy, clinical depression, anxiety disorders, OCD, and stress coping counseling.',
    days: ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'THURSDAY'],
  },
  {
    name: 'Dr. Golam Mostafa',
    email: 'dr.mostafa@shebamitro.health',
    phone: '+8801722222209',
    bmdcRegNo: 'BMDC-A89012',
    specialization: 'ENT Care',
    qualifications: ['MBBS (DMC)', 'MS (ENT)', 'DLO'],
    experienceYears: 16,
    consultFee: 1200,
    followUpFee: 600,
    hospital: 'Dhaka Medical College Hospital',
    gender: 'male',
    rating: 4.8,
    reviewCount: 155,
    bio: 'Senior ENT Head & Neck Surgeon specialized in endoscopic sinus surgery, micro-ear surgery for hearing restoration, and vocal cord lesion management.',
    days: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Asaduzzaman Khan',
    email: 'dr.asad@shebamitro.health',
    phone: '+8801722222210',
    bmdcRegNo: 'BMDC-A90123',
    specialization: 'Oncology',
    qualifications: ['MBBS (DMC)', 'FCPS (Radiotherapy)', 'MD (Medical Oncology)'],
    experienceYears: 18,
    consultFee: 1800,
    followUpFee: 900,
    hospital: 'National Institute of Cancer Research & Hospital (NICRH)',
    gender: 'male',
    rating: 4.95,
    reviewCount: 175,
    bio: 'Professor & Clinical Oncologist with 18+ years leading precision chemotherapy protocols, targeted immunotherapy, and comprehensive oncology tumor board care.',
    days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
  {
    name: 'Dr. Tariqul Islam',
    email: 'dr.tariqul@shebamitro.health',
    phone: '+8801722222211',
    bmdcRegNo: 'BMDC-A11223',
    specialization: 'Orthopedics',
    qualifications: ['MBBS (SSMC)', 'D-Ortho (NITOR)', 'MS (Orthopedics)'],
    experienceYears: 12,
    consultFee: 1100,
    followUpFee: 550,
    hospital: 'Square Hospital Ltd., Dhaka',
    gender: 'male',
    rating: 4.8,
    reviewCount: 120,
    bio: 'Consultant Orthopedic Surgeon specialized in sports ligament injuries, keyhole knee arthroscopy, and complex trauma bone healing.',
    days: ['SUNDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SATURDAY'],
  },
];

async function main() {
  console.log('🌱 Seeding 12+ verified Bangladeshi doctors with availability slots...');

  const defaultPassword = process.env.DOCTOR_PASSWORD || 'Password123!';
  const passwordHash = await argon2.hash(defaultPassword);

  for (const doc of ALL_DOCTORS) {
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ email: doc.email }, { phone: doc.phone }],
      },
      include: { doctorProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: doc.name,
          email: doc.email,
          phone: doc.phone,
          passwordHash,
          role: Role.DOCTOR,
          isVerified: true,
          doctorProfile: {
            create: {
              bmdcRegNo: doc.bmdcRegNo,
              name: doc.name,
              specialization: doc.specialization,
              qualifications: doc.qualifications,
              experienceYears: doc.experienceYears,
              consultFee: doc.consultFee,
              followUpFee: doc.followUpFee,
              isApproved: true,
              bio: doc.bio,
              hospital: doc.hospital,
              gender: doc.gender,
              rating: doc.rating,
              reviewCount: doc.reviewCount,
            },
          },
        },
        include: { doctorProfile: true },
      });
      console.log(` Created Doctor: ${doc.name}`);
    } else {
      if (user.doctorProfile) {
        await prisma.doctorProfile.update({
          where: { id: user.doctorProfile.id },
          data: {
            name: doc.name,
            specialization: doc.specialization,
            qualifications: doc.qualifications,
            experienceYears: doc.experienceYears,
            consultFee: doc.consultFee,
            followUpFee: doc.followUpFee,
            isApproved: true,
            bio: doc.bio,
            hospital: doc.hospital,
            gender: doc.gender,
            rating: doc.rating,
            reviewCount: doc.reviewCount,
          },
        });
        console.log(` Updated Doctor Profile: ${doc.name}`);
      } else {
        await prisma.doctorProfile.create({
          data: {
            userId: user.id,
            bmdcRegNo: doc.bmdcRegNo,
            name: doc.name,
            specialization: doc.specialization,
            qualifications: doc.qualifications,
            experienceYears: doc.experienceYears,
            consultFee: doc.consultFee,
            followUpFee: doc.followUpFee,
            isApproved: true,
            bio: doc.bio,
            hospital: doc.hospital,
            gender: doc.gender,
            rating: doc.rating,
            reviewCount: doc.reviewCount,
          },
        });
        console.log(` Created Profile for existing user: ${doc.name}`);
      }
    }

    // Refresh doctor profile reference
    const updatedDoc = await prisma.doctorProfile.findFirst({
      where: { bmdcRegNo: doc.bmdcRegNo },
    });

    if (updatedDoc) {
      // Seed Doctor Availability slots
      for (const day of doc.days) {
        const existingAvail = await prisma.doctorAvailability.findFirst({
          where: { doctorId: updatedDoc.id, dayOfWeek: day },
        });

        if (!existingAvail) {
          await prisma.doctorAvailability.create({
            data: {
              doctorId: updatedDoc.id,
              dayOfWeek: day,
              startTime: '09:00',
              endTime: '13:00',
              slotDurationMinutes: 30,
            },
          });
          await prisma.doctorAvailability.create({
            data: {
              doctorId: updatedDoc.id,
              dayOfWeek: day,
              startTime: '16:00',
              endTime: '20:00',
              slotDurationMinutes: 30,
            },
          });
        }
      }
    }
  }

  console.log('✅ Doctor profiles and weekly availability slots seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding doctors:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
