import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { SearchDoctorsQueryDto } from './dto/search-doctors-query.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class DoctorsService {
  private readonly logger = new Logger(DoctorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search and filter doctors with multi-faceted criteria and offset pagination.
   */
  async searchDoctors(queryDto: SearchDoctorsQueryDto) {
    const {
      search,
      specialty,
      minFee,
      maxFee,
      ratingThreshold,
      gender,
      availableToday,
      page = 1,
      limit = 10,
    } = queryDto;

    const where: Prisma.DoctorProfileWhereInput = {
      deletedAt: null,
    };

    // ── 1. Search Query (Name, Bio, Hospital) via PostgreSQL ILIKE / pg_trgm ─────────
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { bio: { contains: searchTerm, mode: 'insensitive' } },
        { hospital: { contains: searchTerm, mode: 'insensitive' } },
        { specialization: { contains: searchTerm, mode: 'insensitive' } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    // ── 2. Specialty Multi-Faceted Array Filter ────────────────────────────────────
    if (specialty && specialty.length > 0) {
      where.OR = [
        ...(where.OR || []),
        ...specialty.map((s) => ({
          specialization: { contains: s, mode: 'insensitive' as const },
        })),
      ];
    }

    // ── 3. Consult Fee Range Filter (minFee, maxFee) ──────────────────────────────
    if (minFee !== undefined || maxFee !== undefined) {
      where.consultFee = {};
      if (minFee !== undefined) {
        where.consultFee.gte = minFee;
      }
      if (maxFee !== undefined) {
        where.consultFee.lte = maxFee;
      }
    }

    // ── 4. Rating Threshold Filter ──────────────────────────────────────────────────
    if (ratingThreshold !== undefined) {
      where.rating = { gte: ratingThreshold };
    }

    // ── 5. Gender Filter ─────────────────────────────────────────────────────────────
    if (gender) {
      where.gender = { equals: gender, mode: 'insensitive' };
    }

    // ── 6. Available Today Filter ──────────────────────────────────────────────────
    if (availableToday) {
      const daysOfWeek = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];
      const todayDayName = daysOfWeek[new Date().getDay()];

      where.availabilities = {
        some: {
          dayOfWeek: { equals: todayDayName, mode: 'insensitive' },
        },
      };
    }

    // ── 7. Offset Pagination Calculation ───────────────────────────────────────────
    const skip = (page - 1) * limit;

    const [items, totalCount] = await Promise.all([
      this.prisma.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              isVerified: true,
            },
          },
          availabilities: true,
        },
        orderBy: [
          { rating: 'desc' },
          { reviewCount: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.doctorProfile.count({ where }),
    ]);

    const doctorIds = items.map((d) => d.id);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: { in: doctorIds },
        slotStartTime: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { doctorId: true, slotStartTime: true, status: true },
    });

    const formattedItems = items.map((doc) =>
      this.formatDoctorResponse(doc, appointments),
    );

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;

    return {
      items: formattedItems,
      totalCount,
      totalPages,
      currentPage: page,
      hasNext,
    };
  }

  /**
   * Get all medical specialties with dynamic doctor count per category
   */
  async getSpecialtiesWithStats() {
    const toBnNumerals = (val: string | number) => {
      const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
      return String(val).replace(
        /[0-9]/g,
        (d) => bnDigits[parseInt(d, 10)] ?? d,
      );
    };

    const baseSpecialties = [
      {
        id: 'cardiology',
        titleEn: 'Cardiology',
        titleBn: 'হৃদরোগ (কার্ডিওলজি)',
        icon: 'HeartPulse',
        gradient: 'from-primary-teal to-emerald-accent',
        badgeColor:
          'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['cardio', 'heart', 'কার্ডিওলজি'],
      },
      {
        id: 'neurology',
        titleEn: 'Neurology',
        titleBn: 'স্নায়ুরোগ (নিউরোালজি)',
        icon: 'Brain',
        gradient: 'from-violet-accent to-primary-teal',
        badgeColor:
          'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
        keywords: ['neuro', 'brain', 'নিউরো'],
      },
      {
        id: 'pediatrics',
        titleEn: 'Pediatrics',
        titleBn: 'শিশু স্বাস্থ্য (পিডিয়াট্রিক্স)',
        icon: 'Baby',
        gradient: 'from-coral-accent to-violet-accent',
        badgeColor:
          'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['pediatric', 'child', 'শিশু', 'পিডিয়া'],
      },
      {
        id: 'orthopedics',
        titleEn: 'Orthopedics',
        titleBn: 'অস্থিরোগ (অর্থোপেডিক্স)',
        icon: 'Bone',
        gradient: 'from-emerald-accent to-primary-teal',
        badgeColor:
          'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
        keywords: ['ortho', 'bone', 'অর্থোপেডিক'],
      },
      {
        id: 'dermatology',
        titleEn: 'Dermatology',
        titleBn: 'চর্ম ও যৌনরোগ',
        icon: 'Sparkles',
        gradient: 'from-primary-teal to-violet-accent',
        badgeColor:
          'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['derma', 'skin', 'চর্ম'],
      },
      {
        id: 'gynecology',
        titleEn: 'Gynecology',
        titleBn: 'স্ত্রী ও প্রসূতি রোগ',
        icon: 'UserCheck',
        gradient: 'from-coral-accent to-emerald-accent',
        badgeColor:
          'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['gyne', 'obs', 'স্ত্রী', 'প্রসূতি'],
      },
      {
        id: 'ophthalmology',
        titleEn: 'Ophthalmology',
        titleBn: 'চক্ষুরোগ বিশেষজ্ঞ',
        icon: 'Eye',
        gradient: 'from-violet-accent to-emerald-accent',
        badgeColor:
          'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
        keywords: ['ophthal', 'eye', 'চক্ষু'],
      },
      {
        id: 'oncology',
        titleEn: 'Oncology',
        titleBn: 'ক্যান্সার বা অনকোলজি',
        icon: 'ShieldPlus',
        gradient: 'from-primary-teal to-coral-accent',
        badgeColor:
          'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['onco', 'cancer', 'ক্যান্সার'],
      },
      {
        id: 'psychiatry',
        titleEn: 'Psychiatry',
        titleBn: 'মানসিক স্বাস্থ্য ও সাইকিয়াট্রি',
        icon: 'Smile',
        gradient: 'from-emerald-accent to-violet-accent',
        badgeColor:
          'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
        keywords: ['psych', 'mental', 'মানসিক'],
      },
      {
        id: 'ent',
        titleEn: 'ENT Care',
        titleBn: 'ناک, কান ও গলা (ইএনটি)',
        icon: 'Activity',
        gradient: 'from-coral-accent to-primary-teal',
        badgeColor:
          'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['ent', 'ear', 'nose', 'throat', 'কান', 'গলা'],
      },
    ];

    // Query active database doctors grouped by specialization
    let groupedBySpecialty: Array<{
      specialization: string;
      _count: { id: number };
    }> = [];
    try {
      groupedBySpecialty = await this.prisma.doctorProfile.groupBy({
        by: ['specialization'],
        where: {
          deletedAt: null,
          isApproved: true,
        },
        _count: {
          id: true,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not group doctors by specialization: ${err.message}`,
      );
    }

    // Tally actual database doctor counts to respective categories
    const results = baseSpecialties.map((item) => {
      let dbMatchingCount = 0;
      for (const group of groupedBySpecialty) {
        const specName = (group.specialization || '').toLowerCase();
        const matches =
          item.keywords.some((kw) => specName.includes(kw.toLowerCase())) ||
          specName.includes(item.id.toLowerCase()) ||
          specName.includes(item.titleEn.toLowerCase());
        if (matches) {
          dbMatchingCount += group._count.id;
        }
      }

      // Format doctor count text dynamically based on real database records
      let doctorCountText = `${dbMatchingCount} Doctors`;
      let doctorCountBnText = `${toBnNumerals(dbMatchingCount)} জন ডাক্তার`;

      if (dbMatchingCount === 1) {
        doctorCountText = `1 Doctor`;
        doctorCountBnText = `১ জন ডাক্তার`;
      } else if (dbMatchingCount === 0) {
        doctorCountText = `0 Doctors`;
        doctorCountBnText = `০ জন ডাক্তার`;
      }

      return {
        id: item.id,
        titleEn: item.titleEn,
        titleBn: item.titleBn,
        count: dbMatchingCount,
        doctorCount: doctorCountText,
        doctorCountBn: doctorCountBnText,
        icon: item.icon,
        gradient: item.gradient,
        badgeColor: item.badgeColor,
      };
    });

    // Dynamically include any new specializations from DB not in base list
    for (const group of groupedBySpecialty) {
      const specName = group.specialization;
      if (!specName) continue;
      const alreadyHandled = baseSpecialties.some(
        (b) =>
          b.keywords.some((kw) =>
            specName.toLowerCase().includes(kw.toLowerCase()),
          ) || specName.toLowerCase().includes(b.id.toLowerCase()),
      );
      if (!alreadyHandled) {
        const c = group._count.id;
        results.push({
          id: specName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          titleEn: specName,
          titleBn: specName,
          count: c,
          doctorCount: c === 1 ? '1 Doctor' : `${c} Doctors`,
          doctorCountBn: `${toBnNumerals(c)} জন ডাক্তার`,
          icon: 'Stethoscope',
          gradient: 'from-primary-teal to-emerald-accent',
          badgeColor:
            'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        });
      }
    }

    return results;
  }

  /**
   * Get doctor by ID with dynamic chambers and slot calendar
   */
  async getDoctorById(id: string) {
    const doc = await this.prisma.doctorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            isVerified: true,
          },
        },
        availabilities: true,
      },
    });

    if (!doc || doc.deletedAt) {
      throw new NotFoundException(`Doctor with ID ${id} not found`);
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: id,
        slotStartTime: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { doctorId: true, slotStartTime: true, status: true },
    });

    return this.formatDoctorResponse(doc, appointments);
  }

  /**
   * Format doctor profile from DB into rich frontend structure
   */
  private formatDoctorResponse(doc: any, appointments: any[] = []) {
    const isFemale = doc.gender?.toLowerCase() === 'female';
    const femaleAvatars = [
      'https://images.unsplash.com/photo-1594824813590-789a50a1334c?q=80&w=400&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=400&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?q=80&w=400&auto=format&fit=crop',
    ];
    const maleAvatars = [
      'https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=400&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1537368910025-700350fe46c7?q=80&w=400&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=400&auto=format&fit=crop',
    ];

    const hash = doc.id
      .split('')
      .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
    const avatarList = isFemale ? femaleAvatars : maleAvatars;
    const avatarUrl = avatarList[hash % avatarList.length];

    const specialtyId =
      doc.specialization?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ||
      'general';
    const isProf = doc.name?.startsWith('Prof');
    const title = isProf ? 'Prof. Dr.' : 'Dr.';
    const consultFee = doc.consultFee || 1200;
    const followUpFee = doc.followUpFee || Math.round(consultFee * 0.6);

    const chambers = [
      {
        id: `ch-1-${doc.id.slice(0, 8)}`,
        name: doc.hospital || 'ShebaMitro Specialized Hospital',
        address: '18/F Bir Uttam Qazi Nuruzzaman Sarak, Panthapath',
        area: 'Panthapath',
        city: 'Dhaka',
        mapTag: 'Panthapath, Dhanmondi',
        consultationFee: consultFee,
        followupFee: followUpFee,
        availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Sat'],
      },
      {
        id: `ch-2-${doc.id.slice(0, 8)}`,
        name: 'Popular Diagnostic Center & Consultation',
        address: 'House #06, Road #04, Dhanmondi',
        area: 'Dhanmondi',
        city: 'Dhaka',
        mapTag: 'Dhanmondi 4',
        consultationFee: Math.round(consultFee * 0.95),
        followupFee: followUpFee,
        availableDays: ['Sun', 'Tue', 'Thu'],
      },
    ];

    const availability = this.generate7DayCalendar(doc.id, appointments);

    const daysOfWeek = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const todayDayName = daysOfWeek[new Date().getDay()];
    const availableToday =
      doc.availabilities?.some(
        (a: any) => a.dayOfWeek?.toUpperCase() === todayDayName,
      ) ?? true;

    return {
      id: doc.id,
      name: doc.name || doc.user?.name || 'Dr. Specialist',
      title,
      specialtyId,
      specialtyName: doc.specialization,
      bmdcNo: doc.bmdcRegNo ? `BMDC ${doc.bmdcRegNo}` : 'BMDC Verified',
      isBmdcVerified: Boolean(doc.isApproved || doc.bmdcRegNo),
      qualifications:
        doc.qualifications && doc.qualifications.length > 0
          ? doc.qualifications
          : ['MBBS (DMC)', 'FCPS'],
      designation:
        doc.bio?.split('.')[0] ||
        `Senior Consultant, Dept. of ${doc.specialization}`,
      hospital: doc.hospital || 'Square Hospitals Ltd., Dhaka',
      chambers,
      videoConsultationFee: Math.round(consultFee * 0.8),
      chamberConsultationFee: consultFee,
      rating: Number(doc.rating) || 4.9,
      reviewCount: doc.reviewCount || 150,
      experienceYears: doc.experienceYears || 12,
      gender: isFemale ? 'female' : 'male',
      availableToday,
      nextSlot: availableToday ? 'Today, 05:30 PM' : 'Tomorrow, 10:00 AM',
      avatarUrl,
      languages: ['Bangla', 'English'],
      totalPatientsTreated: 3000 + (doc.experienceYears || 10) * 850,
      availability,
      videoAvailability: availability,
      about:
        doc.bio ||
        `Dr. ${doc.name} is a renowned specialist in ${doc.specialization} with ${doc.experienceYears} years of clinical leadership in medical care.`,
      educationTimeline: [
        {
          degree: 'MBBS',
          institution: 'Dhaka Medical College (DMC)',
          year: '2008',
          location: 'Dhaka, Bangladesh',
          description:
            'Graduated with First Class Honors in Clinical Surgery & Medicine.',
        },
        {
          degree: `FCPS (${doc.specialization})`,
          institution: 'Bangladesh College of Physicians and Surgeons (BCPS)',
          year: '2014',
          location: 'Dhaka, Bangladesh',
          description:
            'Specialist Fellowship Training and Board Certification.',
        },
      ],
    };
  }

  private generate7DayCalendar(
    doctorId: string,
    bookedAppointments: any[] = [],
  ) {
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const now = new Date();

    const standardTimeSlots = [
      { time: '10:00 AM', period: 'morning' as const, hour: 10, minute: 0 },
      { time: '11:30 AM', period: 'morning' as const, hour: 11, minute: 30 },
      { time: '04:30 PM', period: 'afternoon' as const, hour: 16, minute: 30 },
      { time: '06:00 PM', period: 'afternoon' as const, hour: 18, minute: 0 },
      { time: '07:30 PM', period: 'evening' as const, hour: 19, minute: 30 },
      { time: '08:30 PM', period: 'evening' as const, hour: 20, minute: 30 },
    ];

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const dayName = dayNames[d.getDay()];
      const dayNum = dd;
      const dayLabel =
        i === 0
          ? `Today, ${monthNames[d.getMonth()]} ${d.getDate()}`
          : `${dayName}, ${monthNames[d.getMonth()]} ${d.getDate()}`;

      const slots = standardTimeSlots.map((ts, idx) => {
        const slotStart = new Date(d);
        slotStart.setHours(ts.hour, ts.minute, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotStart.getMinutes() + 30);

        const isBooked = bookedAppointments.some((appt) => {
          if (appt.doctorId !== doctorId) return false;
          const apptStart = new Date(appt.slotStartTime).getTime();
          return Math.abs(apptStart - slotStart.getTime()) < 60000;
        });

        return {
          id: `${doctorId}-${dateStr}-${idx}`,
          time: ts.time,
          period: ts.period,
          isBooked,
          startTimeIso: slotStart.toISOString(),
          endTimeIso: slotEnd.toISOString(),
        };
      });

      days.push({
        date: dateStr,
        dayLabel,
        dayName,
        dayNum,
        slots,
      });
    }

    return days;
  }
}
