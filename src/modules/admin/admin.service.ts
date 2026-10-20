import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  FilterVerificationsDto,
  VerifyProviderDto,
  ExecutePayoutsDto,
} from './dto/index.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/verifications
   * Paginated list of unverified doctors with BMDC license docs & credentials.
   */
  async getVerifications(dto: FilterVerificationsDto) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 10;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      isApproved: false,
    };

    if (dto.search && dto.search.trim()) {
      const searchTerm = dto.search.trim();
      whereClause.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { bmdcRegNo: { contains: searchTerm, mode: 'insensitive' } },
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { phone: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    const [total, unverifiedDoctors] = await Promise.all([
      this.prisma.doctorProfile.count({ where: whereClause }),
      this.prisma.doctorProfile.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isVerified: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const formattedData = unverifiedDoctors.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      name: doc.name || doc.user?.name,
      email: doc.user?.email,
      phone: doc.user?.phone,
      bmdcRegNo: doc.bmdcRegNo,
      bmdcDocUrl:
        doc.bmdcDocUrl ||
        `https://s3.amazonaws.com/shebamitro-docs/bmdc/${doc.bmdcRegNo}.pdf`,
      specialization: doc.specialization,
      qualifications: doc.qualifications,
      experienceYears: doc.experienceYears,
      consultFee: doc.consultFee,
      followUpFee: doc.followUpFee,
      isApproved: doc.isApproved,
      hospital: doc.hospital,
      submittedAt: doc.createdAt,
    }));

    return {
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * PUT /admin/verify-provider/:id
   * Approve or reject doctor/provider with audit trail.
   */
  async verifyProvider(
    providerId: string,
    dto: VerifyProviderDto,
    adminUserId?: string,
  ) {
    const providerType = 'DOCTOR';
    const targetProfile = await this.prisma.doctorProfile.findFirst({
      where: {
        OR: [{ id: providerId }, { userId: providerId }],
      },
      include: { user: true },
    });

    if (!targetProfile) {
      throw new NotFoundException(
        `Provider profile with ID '${providerId}' was not found.`,
      );
    }

    const updatedDoctor = await this.prisma.doctorProfile.update({
      where: { id: targetProfile.id },
      data: {
        isApproved: dto.approved,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (dto.approved && targetProfile.user) {
      await this.prisma.user.update({
        where: { id: targetProfile.user.id },
        data: { isVerified: true },
      });
    }

    const actionText = dto.approved ? 'PROVIDER_APPROVED' : 'PROVIDER_REJECTED';
    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminUserId || null,
        action: actionText,
        targetType: providerType,
        targetId: updatedDoctor.id,
        detailsJson: {
          approved: dto.approved,
          rejectionReason: dto.rejectionReason || null,
          notes: dto.notes || null,
          bmdcRegNo: updatedDoctor.bmdcRegNo,
          providerName: updatedDoctor.name || updatedDoctor.user?.name,
        },
      },
    });

    return {
      message: `Provider '${updatedDoctor.name || updatedDoctor.bmdcRegNo}' status updated to ${dto.approved ? 'APPROVED' : 'REJECTED'}.`,
      provider: {
        id: updatedDoctor.id,
        userId: updatedDoctor.userId,
        name: updatedDoctor.name || updatedDoctor.user?.name,
        bmdcRegNo: updatedDoctor.bmdcRegNo,
        isApproved: updatedDoctor.isApproved,
        specialization: updatedDoctor.specialization,
        updatedAt: updatedDoctor.updatedAt,
      },
      audit: {
        action: actionText,
        rejectionReason: dto.rejectionReason || null,
        notes: dto.notes || null,
      },
    };
  }

  /**
   * GET /admin/settlements
   * Calculate payable balances to doctors and labs based on completed transactions and wallets.
   */
  async getSettlements() {
    const wallets = await this.prisma.wallet.findMany({
      where: {
        providerType: { in: ['DOCTOR', 'LAB', 'PHARMACY'] },
      },
      orderBy: { balance: 'desc' },
    });

    const doctorProfiles = await this.prisma.doctorProfile.findMany({
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    const labProfiles = await this.prisma.labProfile.findMany({
      include: { user: { select: { name: true, email: true, phone: true } } },
    });

    const doctorMap = new Map(doctorProfiles.map((d) => [d.id, d]));
    const labMap = new Map(labProfiles.map((l) => [l.id, l]));

    const transactions = await this.prisma.transaction.findMany({
      where: {
        status: 'COMPLETED',
      },
      select: {
        providerId: true,
        providerType: true,
        amount: true,
        providerAmount: true,
        platformCommission: true,
      },
    });

    const txSummaryByProvider = new Map<
      string,
      { grossVolume: number; netEarned: number; totalCommission: number }
    >();

    for (const tx of transactions) {
      if (!tx.providerId) continue;
      const existing = txSummaryByProvider.get(tx.providerId) || {
        grossVolume: 0,
        netEarned: 0,
        totalCommission: 0,
      };
      existing.grossVolume += tx.amount || 0;
      existing.netEarned += tx.providerAmount || 0;
      existing.totalCommission += tx.platformCommission || 0;
      txSummaryByProvider.set(tx.providerId, existing);
    }

    const settlements: any[] = [];
    let totalPayableAmount = 0;
    let totalEarnedAmount = 0;
    let totalPlatformCommission = 0;

    for (const wallet of wallets) {
      let name = 'Unknown Provider';
      let email: string | null = null;
      let phone: string | null = null;
      let accountRef: string | null = null;

      if (wallet.providerType === 'DOCTOR') {
        const doc = doctorMap.get(wallet.providerId);
        if (doc) {
          name = doc.name || doc.user?.name || 'Doctor';
          email = doc.user?.email || null;
          phone = doc.user?.phone || null;
          accountRef = doc.bmdcRegNo;
        }
      } else if (wallet.providerType === 'LAB') {
        const lab = labMap.get(wallet.providerId);
        if (lab) {
          name = lab.labName;
          email = lab.user?.email || null;
          phone = lab.user?.phone || null;
          accountRef = lab.licenseNo;
        }
      }

      const txStats = txSummaryByProvider.get(wallet.providerId) || {
        grossVolume: 0,
        netEarned: wallet.totalEarned || 0,
        totalCommission: 0,
      };

      const payableBalance = Math.max(0, wallet.balance);
      totalPayableAmount += payableBalance;
      totalEarnedAmount += wallet.totalEarned;
      totalPlatformCommission += txStats.totalCommission;

      settlements.push({
        providerId: wallet.providerId,
        providerType: wallet.providerType,
        providerName: name,
        email,
        phone,
        accountRef,
        grossTransactionVolume: txStats.grossVolume,
        totalEarned: wallet.totalEarned,
        platformCommission: txStats.totalCommission,
        currentBalance: wallet.balance,
        payableBalance,
        lastUpdated: wallet.updatedAt,
      });
    }

    return {
      summary: {
        totalProvidersCount: settlements.length,
        totalPayableAmount,
        totalEarnedAmount,
        totalPlatformCommission,
      },
      settlements,
    };
  }

  /**
   * POST /admin/payouts/execute
   * Batch bank/mobile financial service (bKash/Nagad) disbursement.
   */
  async executePayouts(dto: ExecutePayoutsDto, adminUserId?: string) {
    if (!dto.payouts || dto.payouts.length === 0) {
      throw new BadRequestException('Payout list cannot be empty.');
    }

    const results: any[] = [];
    const failures: any[] = [];
    let totalDisbursedAmount = 0;

    for (const payoutItem of dto.payouts) {
      const {
        providerId,
        providerType,
        amount,
        paymentMethod,
        accountDetails,
      } = payoutItem;

      try {
        let wallet = await this.prisma.wallet.findUnique({
          where: { providerId },
        });

        if (!wallet) {
          wallet = await this.prisma.wallet.create({
            data: {
              providerId,
              providerType,
              balance: 0,
              totalEarned: 0,
            },
          });
        }

        if (wallet.balance < amount) {
          failures.push({
            providerId,
            amount,
            reason: `Insufficient wallet balance. Available: BDT ${wallet.balance}, Requested: BDT ${amount}`,
          });
          continue;
        }

        const updatedWallet = await this.prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { decrement: amount },
          },
        });

        const transactionRef = `DISB-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const payoutRecord = await this.prisma.payout.create({
          data: {
            providerId,
            providerType,
            amount,
            paymentMethod: paymentMethod.toUpperCase(),
            accountDetails,
            status: 'DISBURSED',
            disbursedAt: new Date(),
            transactionRef,
          },
        });

        totalDisbursedAmount += amount;
        results.push({
          payoutId: payoutRecord.id,
          providerId,
          providerType,
          amountDisbursed: amount,
          remainingWalletBalance: updatedWallet.balance,
          paymentMethod,
          accountDetails,
          transactionRef,
          status: 'DISBURSED',
        });
      } catch (err: any) {
        this.logger.error(
          `Payout failure for provider ${providerId}: ${err.message}`,
          err.stack,
        );
        failures.push({
          providerId,
          amount,
          reason: err.message || 'Payout processing failed',
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminUserId || null,
        action: 'BATCH_PAYOUT_EXECUTED',
        targetType: 'PAYOUT',
        detailsJson: {
          successfulCount: results.length,
          failedCount: failures.length,
          totalDisbursedAmount,
          resultsSummary: results,
          failuresSummary: failures,
        },
      },
    });

    return {
      message: `Batch payout execution completed. ${results.length} disbursed, ${failures.length} failed.`,
      successfulCount: results.length,
      failedCount: failures.length,
      totalDisbursedAmount,
      disbursements: results,
      failures,
    };
  }

  // ==========================================
  // MASTER DATA: MEDICAL SPECIALTIES CRUD
  // ==========================================
  async getSpecialties(query?: { search?: string; isActive?: string }) {
    const where: any = {};
    if (query?.isActive !== undefined && query?.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }
    if (query?.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
        { titleBn: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.medicalSpecialty.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSpecialtyById(idOrCode: string) {
    const specialty = await this.prisma.medicalSpecialty.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
    });
    if (!specialty) {
      throw new NotFoundException(`Specialty ${idOrCode} not found`);
    }
    return specialty;
  }

  async createSpecialty(data: any) {
    const cleanCode = (data.code || data.titleEn || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-');
    return this.prisma.medicalSpecialty.create({
      data: {
        code: cleanCode,
        titleEn: data.titleEn,
        titleBn: data.titleBn,
        icon: data.icon || 'HeartPulse',
        gradient: data.gradient || 'from-primary-teal to-emerald-accent',
        badgeColor:
          data.badgeColor ||
          'text-primary-teal bg-primary-teal/15 border-primary-teal/30',
        description: data.description || null,
        keywords: Array.isArray(data.keywords)
          ? data.keywords
          : typeof data.keywords === 'string'
            ? data.keywords
                .split(',')
                .map((k: string) => k.trim())
                .filter(Boolean)
            : [data.titleEn?.toLowerCase() || ''],
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
    });
  }

  async updateSpecialty(idOrCode: string, data: any) {
    const existing = await this.getSpecialtyById(idOrCode);
    const updateData: any = {};
    if (data.code !== undefined) {
      updateData.code = data.code.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    }
    if (data.titleEn !== undefined) updateData.titleEn = data.titleEn;
    if (data.titleBn !== undefined) updateData.titleBn = data.titleBn;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.gradient !== undefined) updateData.gradient = data.gradient;
    if (data.badgeColor !== undefined) updateData.badgeColor = data.badgeColor;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.keywords !== undefined) {
      updateData.keywords = Array.isArray(data.keywords)
        ? data.keywords
        : typeof data.keywords === 'string'
          ? data.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : [];
    }
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

    return this.prisma.medicalSpecialty.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  async deleteSpecialty(idOrCode: string) {
    const existing = await this.getSpecialtyById(idOrCode);
    return this.prisma.medicalSpecialty.delete({
      where: { id: existing.id },
    });
  }

  // ==========================================
  // MASTER DATA: ICD-10 DIAGNOSES CRUD
  // ==========================================
  async getIcd10(query?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
  }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.status && query.status !== 'all') {
      where.isActive = query.status === 'Active';
    }
    if (query?.category && query.category !== 'all') {
      where.category = { contains: query.category, mode: 'insensitive' };
    }
    if (query?.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { diagnosisTitle: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.icd10Diagnosis.count({ where }),
      this.prisma.icd10Diagnosis.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
      }),
    ]);

    const formattedItems = items.map((item) => ({
      ...item,
      status: item.isActive ? 'Active' : 'Deprecated',
    }));

    return {
      items: formattedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getIcd10ById(id: string) {
    const item = await this.prisma.icd10Diagnosis.findFirst({
      where: {
        OR: [{ id }, { code: id }],
      },
    });
    if (!item) {
      throw new NotFoundException(`ICD-10 item ${id} not found`);
    }
    return {
      ...item,
      status: item.isActive ? 'Active' : 'Deprecated',
    };
  }

  async createIcd10(data: {
    code: string;
    diagnosisTitle: string;
    category: string;
    isChronic?: boolean;
    status?: string;
    isActive?: boolean;
  }) {
    const cleanCode = data.code.toUpperCase().trim();
    const isActive =
      data.status !== undefined
        ? data.status === 'Active'
        : data.isActive !== undefined
          ? Boolean(data.isActive)
          : true;

    const item = await this.prisma.icd10Diagnosis.create({
      data: {
        code: cleanCode,
        diagnosisTitle: data.diagnosisTitle,
        category: data.category || 'General',
        isChronic: Boolean(data.isChronic),
        isActive,
      },
    });

    return {
      ...item,
      status: item.isActive ? 'Active' : 'Deprecated',
    };
  }

  async updateIcd10(id: string, data: any) {
    const existing = await this.prisma.icd10Diagnosis.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new NotFoundException(`ICD-10 item ${id} not found`);
    }

    const updateData: any = {};
    if (data.code) updateData.code = data.code.toUpperCase().trim();
    if (data.diagnosisTitle !== undefined)
      updateData.diagnosisTitle = data.diagnosisTitle;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.isChronic !== undefined)
      updateData.isChronic = Boolean(data.isChronic);
    if (data.status !== undefined)
      updateData.isActive = data.status === 'Active';
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

    const item = await this.prisma.icd10Diagnosis.update({
      where: { id: existing.id },
      data: updateData,
    });

    return {
      ...item,
      status: item.isActive ? 'Active' : 'Deprecated',
    };
  }

  async deleteIcd10(id: string) {
    const existing = await this.prisma.icd10Diagnosis.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new NotFoundException(`ICD-10 item ${id} not found`);
    }
    return this.prisma.icd10Diagnosis.delete({
      where: { id: existing.id },
    });
  }

  // ==========================================
  // MASTER DATA: APPROVED DRUGS / MEDICINES CRUD
  // ==========================================
  async getMedicines(query?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
  }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.status && query.status !== 'all') {
      where.inStock = query.status === 'Active';
    }
    if (query?.category && query.category !== 'all') {
      where.category = { contains: query.category, mode: 'insensitive' };
    }
    if (query?.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { genericName: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
        { strength: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.medicine.count({ where }),
      this.prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
    ]);

    const formattedItems = items.map((item) => ({
      ...item,
      brandName: item.name,
      formulation: item.type,
      dgdaApprovalNo: `DAR-${item.id.slice(0, 4).toUpperCase()}-1048`,
      status: item.inStock ? 'Active' : 'Deprecated',
      stockCount: item.stockQuantity,
      updatedAt: item.updatedAt.toISOString().substring(0, 10),
    }));

    return {
      items: formattedItems,
      medicines: formattedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMedicineById(id: string) {
    const item = await this.prisma.medicine.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`Medicine ${id} not found`);
    }
    return {
      ...item,
      brandName: item.name,
      formulation: item.type,
      dgdaApprovalNo: `DAR-${item.id.slice(0, 4).toUpperCase()}-1048`,
      status: item.inStock ? 'Active' : 'Deprecated',
      stockCount: item.stockQuantity,
      updatedAt: item.updatedAt.toISOString().substring(0, 10),
    };
  }

  async createMedicine(data: any) {
    const name = data.brandName || data.name || 'Medicine';
    const type = data.formulation || data.type || 'Tablet';
    const price = Number(data.price) || 10.0;
    const stockQuantity = Number(data.stockCount || data.stockQuantity || 100);
    const inStock =
      data.status !== undefined
        ? data.status === 'Active'
        : data.inStock !== undefined
          ? Boolean(data.inStock)
          : true;

    const item = await this.prisma.medicine.create({
      data: {
        name,
        genericName: data.genericName || 'Generic Name',
        manufacturer: data.manufacturer || 'Pharmaceuticals',
        strength: data.strength || '500 mg',
        type,
        packSize: data.packSize || '10 Strips',
        price,
        category: data.category || 'General',
        requiresPrescription: Boolean(
          data.prescriptionRequired || data.requiresPrescription,
        ),
        inStock,
        stockQuantity,
        imageUrl: data.imageUrl || null,
        description: data.description || null,
        dosageGuidance: data.dosageGuidance || null,
      },
    });

    return {
      ...item,
      brandName: item.name,
      formulation: item.type,
      dgdaApprovalNo: `DAR-${item.id.slice(0, 4).toUpperCase()}-1048`,
      status: item.inStock ? 'Active' : 'Deprecated',
      stockCount: item.stockQuantity,
      updatedAt: item.updatedAt.toISOString().substring(0, 10),
    };
  }

  async updateMedicine(id: string, data: any) {
    const existing = await this.prisma.medicine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Medicine ${id} not found`);
    }

    const updateData: any = {};
    if (data.brandName || data.name) {
      updateData.name = data.brandName || data.name;
    }
    if (data.genericName !== undefined)
      updateData.genericName = data.genericName;
    if (data.manufacturer !== undefined)
      updateData.manufacturer = data.manufacturer;
    if (data.strength !== undefined) updateData.strength = data.strength;
    if (data.formulation || data.type) {
      updateData.type = data.formulation || data.type;
    }
    if (data.packSize !== undefined) updateData.packSize = data.packSize;
    if (data.price !== undefined) updateData.price = Number(data.price);
    if (data.category !== undefined) updateData.category = data.category;
    if (
      data.prescriptionRequired !== undefined ||
      data.requiresPrescription !== undefined
    ) {
      updateData.requiresPrescription = Boolean(
        data.prescriptionRequired ?? data.requiresPrescription,
      );
    }
    if (data.status !== undefined) {
      updateData.inStock = data.status === 'Active';
    }
    if (data.inStock !== undefined) {
      updateData.inStock = Boolean(data.inStock);
    }
    if (data.stockCount !== undefined || data.stockQuantity !== undefined) {
      updateData.stockQuantity = Number(
        data.stockCount ?? data.stockQuantity,
      );
    }
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.dosageGuidance !== undefined)
      updateData.dosageGuidance = data.dosageGuidance;

    const item = await this.prisma.medicine.update({
      where: { id: existing.id },
      data: updateData,
    });

    return {
      ...item,
      brandName: item.name,
      formulation: item.type,
      dgdaApprovalNo: `DAR-${item.id.slice(0, 4).toUpperCase()}-1048`,
      status: item.inStock ? 'Active' : 'Deprecated',
      stockCount: item.stockQuantity,
      updatedAt: item.updatedAt.toISOString().substring(0, 10),
    };
  }

  async deleteMedicine(id: string) {
    const existing = await this.prisma.medicine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Medicine ${id} not found`);
    }
    return this.prisma.medicine.delete({
      where: { id: existing.id },
    });
  }
}
