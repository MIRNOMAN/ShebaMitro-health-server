import { Injectable, Logger } from '@nestjs/common';
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

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;

    return {
      items,
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
      return String(val).replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)] ?? d);
    };

    const baseSpecialties = [
      {
        id: 'cardiology',
        titleEn: 'Cardiology',
        titleBn: 'হৃদরোগ (কার্ডিওলজি)',
        icon: 'HeartPulse',
        gradient: 'from-primary-teal to-emerald-accent',
        badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['cardio', 'heart', 'কার্ডিওলজি'],
      },
      {
        id: 'neurology',
        titleEn: 'Neurology',
        titleBn: 'স্নায়ুরোগ (নিউরোালজি)',
        icon: 'Brain',
        gradient: 'from-violet-accent to-primary-teal',
        badgeColor: 'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
        keywords: ['neuro', 'brain', 'নিউরো'],
      },
      {
        id: 'pediatrics',
        titleEn: 'Pediatrics',
        titleBn: 'শিশু স্বাস্থ্য (পিডিয়াট্রিক্স)',
        icon: 'Baby',
        gradient: 'from-coral-accent to-violet-accent',
        badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['pediatric', 'child', 'শিশু', 'পিডিয়া'],
      },
      {
        id: 'orthopedics',
        titleEn: 'Orthopedics',
        titleBn: 'অস্থিরোগ (অর্থোপেডিক্স)',
        icon: 'Bone',
        gradient: 'from-emerald-accent to-primary-teal',
        badgeColor: 'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
        keywords: ['ortho', 'bone', 'অর্থোপেডিক'],
      },
      {
        id: 'dermatology',
        titleEn: 'Dermatology',
        titleBn: 'চর্ম ও যৌনরোগ',
        icon: 'Sparkles',
        gradient: 'from-primary-teal to-violet-accent',
        badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['derma', 'skin', 'চর্ম'],
      },
      {
        id: 'gynecology',
        titleEn: 'Gynecology',
        titleBn: 'স্ত্রী ও প্রসূতি রোগ',
        icon: 'UserCheck',
        gradient: 'from-coral-accent to-emerald-accent',
        badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['gyne', 'obs', 'স্ত্রী', 'প্রসূতি'],
      },
      {
        id: 'ophthalmology',
        titleEn: 'Ophthalmology',
        titleBn: 'চক্ষুরোগ বিশেষজ্ঞ',
        icon: 'Eye',
        gradient: 'from-violet-accent to-emerald-accent',
        badgeColor: 'text-violet-accent bg-violet-accent/15 border-violet-accent/30',
        keywords: ['ophthal', 'eye', 'চক্ষু'],
      },
      {
        id: 'oncology',
        titleEn: 'Oncology',
        titleBn: 'ক্যান্সার বা অনকোলজি',
        icon: 'ShieldPlus',
        gradient: 'from-primary-teal to-coral-accent',
        badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        keywords: ['onco', 'cancer', 'ক্যান্সার'],
      },
      {
        id: 'psychiatry',
        titleEn: 'Psychiatry',
        titleBn: 'মানসিক স্বাস্থ্য ও সাইকিয়াট্রি',
        icon: 'Smile',
        gradient: 'from-emerald-accent to-violet-accent',
        badgeColor: 'text-emerald-accent bg-emerald-accent/15 border-emerald-accent/30',
        keywords: ['psych', 'mental', 'মানসিক'],
      },
      {
        id: 'ent',
        titleEn: 'ENT Care',
        titleBn: 'ناک, কান ও গলা (ইএনটি)',
        icon: 'Activity',
        gradient: 'from-coral-accent to-primary-teal',
        badgeColor: 'text-coral-accent bg-coral-accent/15 border-coral-accent/30',
        keywords: ['ent', 'ear', 'nose', 'throat', 'কান', 'গলা'],
      },
    ];

    // Query active database doctors grouped by specialization
    let groupedBySpecialty: Array<{ specialization: string; _count: { id: number } }> = [];
    try {
      groupedBySpecialty = (await this.prisma.doctorProfile.groupBy({
        by: ['specialization'],
        where: {
          deletedAt: null,
          isApproved: true,
        },
        _count: {
          id: true,
        },
      })) as any;
    } catch (err: any) {
      this.logger.warn(`Could not group doctors by specialization: ${err.message}`);
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
          b.keywords.some((kw) => specName.toLowerCase().includes(kw.toLowerCase())) ||
          specName.toLowerCase().includes(b.id.toLowerCase()),
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
          badgeColor: 'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        });
      }
    }

    return results;
  }
}
