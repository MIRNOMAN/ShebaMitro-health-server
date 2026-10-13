const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.doctorAvailability.count();
  console.log('Total doctor availabilities in DB:', count);
  const sample = await prisma.doctorProfile.findFirst({
    include: { availabilities: true, user: true }
  });
  console.log('Sample doctor:', JSON.stringify(sample, null, 2));
}

check().finally(() => prisma.$disconnect());
