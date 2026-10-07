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
}
