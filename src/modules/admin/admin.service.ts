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
}
