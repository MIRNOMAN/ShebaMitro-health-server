import {
  PrismaClient,
  Role,
  AppointmentType,
  AppointmentStatus,
  PaymentStatus,
  VitalType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding authentic Bangladeshi patients and live doctor appointments...');

  const defaultPassword = process.env.PATIENT_PASSWORD || 'Password123!';
  const passwordHash = await argon2.hash(defaultPassword);

  // 1. Define rich authentic patient profiles
  const patientsData = [
    {
      name: 'Sabbir Ahmed',
      email: 'sabbir.ahmed@example.com',
      phone: '+8801712345678',
      bloodGroup: 'O+',
      dob: new Date('1982-04-12'),
      gender: 'Male',
      emergencyContact: '+8801712999901',
      medicalAllergies: ['Penicillin', 'Sulfa drugs'],
      vitals: [
        { type: VitalType.BP, value: 135, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 78, unit: 'bpm' },
        { type: VitalType.SPO2, value: 98, unit: '%' },
      ],
      complaint: 'Severe chest tightness and dyspnea after exertion for 3 days',
    },
    {
      name: 'Nusrat Jahan',
      email: 'nusrat.jahan@example.com',
      phone: '+8801819987654',
      bloodGroup: 'A+',
      dob: new Date('1995-08-23'),
      gender: 'Female',
      emergencyContact: '+8801819999902',
      medicalAllergies: ['Dust', 'Pollen'],
      vitals: [
        { type: VitalType.BP, value: 118, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 92, unit: 'bpm' },
        { type: VitalType.SPO2, value: 99, unit: '%' },
      ],
      complaint: 'High fever (102°F), dry cough, and loss of appetite for 48 hours',
    },
    {
      name: 'Dr. Rafiqul Islam',
      email: 'rafiqul.islam@example.com',
      phone: '+8801911223344',
      bloodGroup: 'B+',
      dob: new Date('1959-11-04'),
      gender: 'Male',
      emergencyContact: '+8801911999903',
      medicalAllergies: [],
      vitals: [
        { type: VitalType.BP, value: 128, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 70, unit: 'bpm' },
        { type: VitalType.SPO2, value: 97, unit: '%' },
      ],
      complaint: 'Routine diabetic follow-up & HbA1c review with fasting sugar fluctuation',
    },
    {
      name: 'Sharmin Sultana',
      email: 'sharmin.sultana@example.com',
      phone: '+8801678554433',
      bloodGroup: 'AB+',
      dob: new Date('1988-06-19'),
      gender: 'Female',
      emergencyContact: '+8801678999904',
      medicalAllergies: ['NSAIDs'],
      vitals: [
        { type: VitalType.BP, value: 122, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 74, unit: 'bpm' },
        { type: VitalType.SPO2, value: 99, unit: '%' },
      ],
      complaint: 'Persistent migraine with aura and nausea during morning work',
    },
    {
      name: 'Kamrul Hasan',
      email: 'kamrul.hasan@example.com',
      phone: '+8801552112233',
      bloodGroup: 'O-',
      dob: new Date('1973-02-14'),
      gender: 'Male',
      emergencyContact: '+8801552999905',
      medicalAllergies: [],
      vitals: [
        { type: VitalType.BP, value: 124, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 72, unit: 'bpm' },
        { type: VitalType.SPO2, value: 98, unit: '%' },
      ],
      complaint: 'Post-surgery knee dressing review and pain management consultation',
    },
    {
      name: 'Tahmina Khatun',
      email: 'tahmina.khatun@example.com',
      phone: '+8801733445566',
      bloodGroup: 'B-',
      dob: new Date('1991-10-30'),
      gender: 'Female',
      emergencyContact: '+8801733999906',
      medicalAllergies: ['Ciprofloxacin'],
      vitals: [
        { type: VitalType.BP, value: 115, unit: 'mmHg' },
        { type: VitalType.HEART_RATE, value: 80, unit: 'bpm' },
        { type: VitalType.SPO2, value: 99, unit: '%' },
      ],
      complaint: 'Gastric hyperacidity and retrosternal burning pain after meals',
    },
  ];

  // Upsert patients
  const createdPatients: any[] = [];
  for (const p of patientsData) {
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ email: p.email }, { phone: p.phone }],
      },
      include: { patientProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          passwordHash,
          role: Role.PATIENT,
          isVerified: true,
          patientProfile: {
            create: {
              bloodGroup: p.bloodGroup,
              dob: p.dob,
              gender: p.gender,
              emergencyContact: p.emergencyContact,
              medicalAllergies: p.medicalAllergies,
            },
          },
        },
        include: { patientProfile: true },
      });
    } else {
      if (user.name !== p.name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: p.name },
        });
      }
      if (!user.patientProfile) {
        await prisma.patientProfile.create({
          data: {
            userId: user.id,
            bloodGroup: p.bloodGroup,
            dob: p.dob,
            gender: p.gender,
            emergencyContact: p.emergencyContact,
            medicalAllergies: p.medicalAllergies,
          },
        });
        user = await prisma.user.findUnique({
          where: { id: user.id },
          include: { patientProfile: true },
        });
      }
    }

    // Add vitals
    if (user?.patientProfile) {
      for (const v of p.vitals) {
        await prisma.biometricVital.create({
          data: {
            patientId: user.patientProfile.id,
            type: v.type,
            value: v.value,
            unit: v.unit,
            recordedAt: new Date(),
          },
        });
      }
      createdPatients.push({ ...p, profileId: user.patientProfile.id, userId: user.id });
    }
  }

  // Find doctors to attach appointments to (e.g. demo doctor + top specialists)
  const targetDoctors = await prisma.doctorProfile.findMany({
    where: { deletedAt: null },
    take: 4,
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
  });

  const demoDoc = await prisma.doctorProfile.findFirst({
    where: { user: { email: 'doctor@shebamitro.health' } },
  });

  if (demoDoc && !targetDoctors.some((d) => d.id === demoDoc.id)) {
    targetDoctors.push(demoDoc);
  }

  if (targetDoctors.length === 0) {
    console.error('❌ No doctors found in database to attach appointments to.');
    return;
  }

  // Today base time
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();

  const appointmentSlots = [
    {
      patientIndex: 0,
      hour: 17,
      minute: 30,
      type: AppointmentType.ONLINE,
      status: AppointmentStatus.IN_PROGRESS,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      patientIndex: 1,
      hour: 17,
      minute: 45,
      type: AppointmentType.ONLINE,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      patientIndex: 2,
      hour: 18,
      minute: 0,
      type: AppointmentType.CHAMBER,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      patientIndex: 3,
      hour: 18,
      minute: 15,
      type: AppointmentType.CHAMBER,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      patientIndex: 4,
      hour: 17,
      minute: 0,
      type: AppointmentType.CHAMBER,
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      patientIndex: 5,
      hour: 18,
      minute: 30,
      type: AppointmentType.ONLINE,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
  ];

  for (const doc of targetDoctors) {
    console.log(` Attaching queue appointments to Doctor: ${doc.name} (${doc.id})`);

    for (const s of appointmentSlots) {
      const pat = createdPatients[s.patientIndex];
      if (!pat) continue;

      const start = new Date(todayY, todayM, todayD, s.hour, s.minute, 0);
      const end = new Date(todayY, todayM, todayD, s.hour, s.minute + 25, 0);

      // Upsert appointment
      const existing = await prisma.appointment.findFirst({
        where: {
          doctorId: doc.id,
          slotStartTime: start,
        },
      });

      if (!existing) {
        await prisma.appointment.create({
          data: {
            doctorId: doc.id,
            patientId: pat.profileId,
            slotStartTime: start,
            slotEndTime: end,
            type: s.type,
            status: s.status,
            paymentStatus: s.paymentStatus,
            notes: pat.complaint,
          },
        });
        console.log(` Created appointment for ${pat.name} at ${s.hour}:${s.minute} with ${doc.name}`);
      }
    }
  }

  console.log('✅ Doctor appointments seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
