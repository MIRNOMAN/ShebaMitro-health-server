import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';

export interface SearchResultItem {
  id: string;
  title: string;
  category: 'doctor' | 'symptom' | 'test' | 'medicine';
  subtitle: string;
  badge: string;
  href: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  items: SearchResultItem[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Omni-search across doctors, symptoms/specialties, lab tests, and medicines
   */
  async search(dto: SearchQueryDto): Promise<SearchResponse> {
    const rawQuery = dto.q?.trim() || '';
    if (!rawQuery) {
      return {
        query: '',
        total: 0,
        items: [],
      };
    }

    const term = rawQuery.toLowerCase();
    const category = dto.category?.toLowerCase() || 'all';
    const limit = dto.limit || 10;
    const perCategoryLimit = Math.max(3, Math.ceil(limit / 3));

    const promises: Promise<SearchResultItem[]>[] = [];

    // 1. Doctors
    if (category === 'all' || category === 'doctor') {
      promises.push(this.searchDoctors(term, perCategoryLimit));
    }

    // 2. Symptoms & Medical Specialties
    if (category === 'all' || category === 'symptom' || category === 'specialty') {
      promises.push(this.searchSymptomsAndSpecialties(term, perCategoryLimit));
    }

    // 3. Lab Tests
    if (category === 'all' || category === 'test' || category === 'lab') {
      promises.push(this.searchLabTests(term, perCategoryLimit));
    }

    // 4. Medicines
    if (category === 'all' || category === 'medicine' || category === 'pharmacy') {
      promises.push(this.searchMedicines(term, perCategoryLimit));
    }

    const resultsArray = await Promise.all(promises);
    const flattened = resultsArray.flat();

    // Limit to requested count
    const items = flattened.slice(0, limit);

    return {
      query: rawQuery,
      total: items.length,
      items,
    };
  }

  /**
   * Dynamic trending medical searches extracted from active database entries
   */
  async getTrendingSearches(): Promise<string[]> {
    try {
      const [specialties, labTests, medicines, diagnoses] = await Promise.all([
        this.prisma.medicalSpecialty.findMany({
          where: { isActive: true },
          take: 3,
          select: { titleEn: true },
          orderBy: { titleEn: 'asc' },
        }),
        this.prisma.labTest.findMany({
          take: 3,
          select: { testName: true },
          orderBy: { isPopular: 'desc' },
        }),
        this.prisma.medicine.findMany({
          take: 3,
          select: { name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.icd10Diagnosis.findMany({
          where: { isActive: true },
          take: 2,
          select: { diagnosisTitle: true },
        }),
      ]);

      const tags: string[] = [];
      diagnoses.forEach((d) => d.diagnosisTitle && tags.push(d.diagnosisTitle));
      specialties.forEach((s) => s.titleEn && tags.push(s.titleEn));
      labTests.forEach((t) => t.testName && tags.push(t.testName));
      medicines.forEach((m) => m.name && tags.push(m.name));

      const unique = Array.from(new Set(tags.filter((t) => Boolean(t && t.trim()))));
      if (unique.length >= 3) {
        return unique.slice(0, 8);
      }
    } catch (error) {
      this.logger.error('Error fetching dynamic trending searches from DB:', error);
    }

    // Safe fallback if database is empty
    return [
      'Chest Pain',
      'Cardiologist',
      'Full Body Checkup',
      'Migraine',
      'Diabetes Test',
      'Paracetamol',
    ];
  }

  private async searchDoctors(term: string, limit: number): Promise<SearchResultItem[]> {
    try {
      const doctors = await this.prisma.doctorProfile.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { specialization: { contains: term, mode: 'insensitive' } },
            { hospital: { contains: term, mode: 'insensitive' } },
            { bio: { contains: term, mode: 'insensitive' } },
            { user: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          specialization: true,
          hospital: true,
          experienceYears: true,
          consultFee: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      return doctors.map((doc) => {
        const rawName = doc.name || doc.user?.name || 'Doctor';
        const title = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
        const exp = doc.experienceYears ? `${doc.experienceYears}+ Yrs Exp` : 'Specialist';
        const subtitle = doc.hospital
          ? `${doc.specialization} • ${doc.hospital}`
          : `${doc.specialization} • ${exp}`;

        return {
          id: `doc_${doc.id}`,
          title,
          category: 'doctor' as const,
          subtitle,
          badge: 'Doctor',
          href: `/doctors?search=${encodeURIComponent(rawName)}`,
        };
      });
    } catch (error) {
      this.logger.error('Error searching doctors:', error);
      return [];
    }
  }

  private async searchSymptomsAndSpecialties(
    term: string,
    limit: number,
  ): Promise<SearchResultItem[]> {
    try {
      const [specialties, diagnoses] = await Promise.all([
        this.prisma.medicalSpecialty.findMany({
          where: {
            isActive: true,
            OR: [
              { titleEn: { contains: term, mode: 'insensitive' } },
              { titleBn: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true,
            code: true,
            titleEn: true,
            titleBn: true,
            description: true,
          },
        }),
        this.prisma.icd10Diagnosis.findMany({
          where: {
            isActive: true,
            OR: [
              { diagnosisTitle: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              { category: { contains: term, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true,
            code: true,
            diagnosisTitle: true,
            category: true,
          },
        }),
      ]);

      const items: SearchResultItem[] = [];

      specialties.forEach((spec) => {
        items.push({
          id: `spec_${spec.id}`,
          title: spec.titleEn,
          category: 'symptom' as const,
          subtitle: spec.description || `${spec.titleBn || 'Specialist'} Consultation`,
          badge: 'Specialty',
          href: `/doctors?specialty=${encodeURIComponent(spec.titleEn)}`,
        });
      });

      diagnoses.forEach((diag) => {
        items.push({
          id: `diag_${diag.id}`,
          title: diag.diagnosisTitle,
          category: 'symptom' as const,
          subtitle: `Diagnosis (${diag.code}) • ${diag.category || 'Clinical Triage'}`,
          badge: 'Symptom',
          href: `/doctors?search=${encodeURIComponent(diag.diagnosisTitle)}`,
        });
      });

      return items;
    } catch (error) {
      this.logger.error('Error searching symptoms & specialties:', error);
      return [];
    }
  }

  private async searchLabTests(term: string, limit: number): Promise<SearchResultItem[]> {
    try {
      const labTests = await this.prisma.labTest.findMany({
        where: {
          OR: [
            { testName: { contains: term, mode: 'insensitive' } },
            { category: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: limit,
        select: {
          id: true,
          testName: true,
          category: true,
          price: true,
          turnaroundHours: true,
        },
      });

      return labTests.map((t) => ({
        id: `lab_${t.id}`,
        title: t.testName,
        category: 'test' as const,
        subtitle: `${t.category} • ৳${t.price} • ${t.turnaroundHours}h Turnaround`,
        badge: 'Lab Test',
        href: `/lab-tests?search=${encodeURIComponent(t.testName)}`,
      }));
    } catch (error) {
      this.logger.error('Error searching lab tests:', error);
      return [];
    }
  }

  private async searchMedicines(term: string, limit: number): Promise<SearchResultItem[]> {
    try {
      const medicines = await this.prisma.medicine.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { genericName: { contains: term, mode: 'insensitive' } },
            { manufacturer: { contains: term, mode: 'insensitive' } },
            { category: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          genericName: true,
          type: true,
          strength: true,
          price: true,
        },
      });

      return medicines.map((m) => ({
        id: `med_${m.id}`,
        title: `${m.name} ${m.strength || ''}`.trim(),
        category: 'medicine' as const,
        subtitle: `${m.genericName} • ${m.type} • ৳${m.price}`,
        badge: 'Pharmacy',
        href: `/pharmacy?search=${encodeURIComponent(m.name)}`,
      }));
    } catch (error) {
      this.logger.error('Error searching medicines:', error);
      return [];
    }
  }
}
