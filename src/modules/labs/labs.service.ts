import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LabOrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { FilterLabTestsDto } from './dto/filter-lab-tests.dto.js';
import { CreateLabOrderDto } from './dto/create-lab-order.dto.js';
import { AssignTechnicianDto } from './dto/assign-technician.dto.js';
import { LabReportCryptoService } from './lab-report-crypto.service.js';

@Injectable()
export class LabsService {
  private readonly logger = new Logger(LabsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly cryptoService: LabReportCryptoService,
  ) {}

  /**
   * GET /api/v1/labs/tests
   * Full-text search and multi-criteria filtering for lab diagnostic tests
   */
  async searchLabTests(dto: FilterLabTestsDto) {
    const {
      search,
      category,
      fastingRequired,
      turnaroundTime,
      minPrice,
      maxPrice,
      labAccreditation,
      page = 1,
      limit = 10,
    } = dto;

    const skip = (page - 1) * limit;

    // Build dynamic Prisma filter clauses
    const where: any = {};

    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (fastingRequired !== undefined) {
      where.fastingRequired = fastingRequired;
    }

    if (turnaroundTime !== undefined) {
      where.turnaroundHours = { lte: turnaroundTime };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (labAccreditation) {
      where.OR = [
        {
          labAccreditation: { contains: labAccreditation, mode: 'insensitive' },
        },
        {
          lab: {
            accreditation: { contains: labAccreditation, mode: 'insensitive' },
          },
        },
      ];
    }

    if (search) {
      const searchClause = [
        { testName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { lab: { labName: { contains: search, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchClause }];
        delete where.OR;
      } else {
        where.OR = searchClause;
      }
    }

    const [tests, total] = await Promise.all([
      this.prisma.labTest.findMany({
        where,
        include: {
          lab: {
            select: {
              id: true,
              labName: true,
              licenseNo: true,
              address: true,
              accreditation: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { price: 'asc' },
      }),
      this.prisma.labTest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    this.logger.log(
      `Lab tests search query returned ${tests.length} tests (total ${total}) on page ${page}`,
    );

    return {
      data: tests,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * GET /api/v1/labs/categories
   * Live dynamic diagnostic categories with test counts
   */
  async getLabCategories() {
    const CATEGORY_META: Record<string, string> = {
      all: 'All Packages',
      full_body: 'Full Body Checkup',
      diabetic: 'Diabetic Health',
      cardiac: 'Cardiac Profile',
      women: "Women's Wellness",
      liver_kidney: 'Liver & Kidney Care',
      thyroid: 'Thyroid & Hormonal',
      infection: 'Infection & Fever',
      vitamins: 'Vitamins & Minerals',
    };

    const [groupedCounts, totalCount] = await Promise.all([
      this.prisma.labTest.groupBy({
        by: ['category'],
        _count: { id: true },
      }),
      this.prisma.labTest.count(),
    ]);

    const countMap: Record<string, number> = {};
    for (const g of groupedCounts) {
      countMap[g.category] = g._count.id;
    }

    const categories = [
      { id: 'all', name: 'All Packages', count: totalCount },
      ...Object.entries(CATEGORY_META)
        .filter(([k]) => k !== 'all')
        .map(([id, name]) => ({
          id,
          name,
          count: countMap[id] || 0,
        })),
    ];

    return categories;
  }

  /**
   * GET /api/v1/labs/tests/:id
   * Fetch single test or package by ID
   */
  async getLabTestById(id: string) {
    const test = await this.prisma.labTest.findUnique({
      where: { id },
      include: {
        lab: {
          select: {
            id: true,
            labName: true,
            licenseNo: true,
            address: true,
            accreditation: true,
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException(`Lab test with ID ${id} not found`);
    }

    return test;
  }

  /**
   * POST /api/v1/labs/orders
   * Book home sample collection for diagnostic lab tests
   */
  async createLabOrder(userId: string | undefined, dto: CreateLabOrderDto) {
    let patientId: string | null = null;

    // 1. Fetch or resolve Patient profile
    if (userId) {
      const existingPatient = await this.prisma.patientProfile.findUnique({
        where: { userId },
      });
      if (existingPatient) {
        patientId = existingPatient.id;
      }
    }

    if (!patientId) {
      const phone = dto.patientPhone || '+8801800000000';
      const name = dto.patientName || 'Guest Patient';

      let user = await this.prisma.user.findFirst({
        where: { phone },
        include: { patientProfile: true },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: `patient_${Date.now()}@shebamitro.health`,
            phone,
            passwordHash: 'GUEST_NO_PASSWORD',
            role: 'PATIENT',
            isVerified: true,
            patientProfile: {
              create: {
                gender: 'Unspecified',
              },
            },
          },
          include: { patientProfile: true },
        });
      } else if (!user.patientProfile) {
        const createdProfile = await this.prisma.patientProfile.create({
          data: { userId: user.id },
        });
        user = { ...user, patientProfile: createdProfile };
      }

      patientId = user.patientProfile!.id;
    }

    // 2. Resolve Diagnostic Lab Profile
    let labId = dto.labId;
    if (!labId) {
      const defaultLab = await this.prisma.labProfile.findFirst();
      if (!defaultLab) {
        throw new NotFoundException('No active diagnostic partner lab available');
      }
      labId = defaultLab.id;
    } else {
      const labProfile = await this.prisma.labProfile.findUnique({
        where: { id: labId },
      });
      if (!labProfile) {
        throw new NotFoundException(`Lab Profile with ID ${labId} not found`);
      }
    }

    // 3. Calculate total fee based on requested tests
    const matchingTests = await this.prisma.labTest.findMany({
      where: {
        testName: { in: dto.testNames },
      },
    });

    let calculatedFee = 0;
    if (matchingTests.length > 0) {
      calculatedFee = matchingTests.reduce((sum, test) => sum + test.price, 0);
    } else {
      calculatedFee = dto.testNames.length * 1200;
    }

    // Free home collection for orders above 2,000 BDT
    if (calculatedFee < 2000) {
      calculatedFee += 150;
    }

    // 4. Create LabOrder record in DB
    const createdOrder = await this.prisma.labOrder.create({
      data: {
        patientId,
        labId,
        prescriptionId: dto.prescriptionId || null,
        testNames: dto.testNames,
        totalFee: calculatedFee,
        sampleCollectionAddress: dto.sampleCollectionAddress,
        sampleCollectionSlot: new Date(dto.sampleCollectionSlot),
        status: LabOrderStatus.PENDING,
        notes: dto.notes || null,
      },
      include: {
        lab: { select: { id: true, labName: true, address: true, accreditation: true } },
        patient: {
          select: {
            id: true,
            user: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    this.logger.log(
      `Successfully created home sample collection LabOrder ${createdOrder.id} for patient ${patientId}`,
    );

    return createdOrder;
  }

  /**
   * GET /api/v1/labs/orders
   * Query lab orders for Lab Dashboard or Patient Dashboard
   */
  async getLabOrders(
    query: {
      status?: LabOrderStatus;
      search?: string;
      page?: number;
      limit?: number;
    },
    user?: { id: string; role: string },
  ) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (user?.role === 'PATIENT') {
      const patient = await this.prisma.patientProfile.findUnique({
        where: { userId: user.id },
      });
      if (patient) {
        where.patientId = patient.id;
      }
    } else if (user?.role === 'LAB') {
      const lab = await this.prisma.labProfile.findUnique({
        where: { userId: user.id },
      });
      if (lab) {
        where.labId = lab.id;
      }
    }

    if (status) {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { sampleCollectionAddress: { contains: q, mode: 'insensitive' } },
        { technicianName: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { id: { contains: q, mode: 'insensitive' } },
        { patient: { user: { name: { contains: q, mode: 'insensitive' } } } },
        { patient: { user: { phone: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        include: {
          lab: {
            select: { id: true, labName: true, address: true, accreditation: true },
          },
          patient: {
            select: {
              id: true,
              user: { select: { name: true, phone: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.labOrder.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * PATCH /api/v1/labs/orders/:id/status
   * Update lab order status (e.g. advance through workflow)
   */
  async updateOrderStatus(orderId: string, status: LabOrderStatus) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    const updated = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: { status },
      include: {
        lab: { select: { id: true, labName: true } },
        patient: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
      },
    });

    this.logger.log(`Updated LabOrder ${orderId} status to ${status}`);
    return updated;
  }

  /**
   * GET /api/v1/labs/stats
   * Real-time metrics for Lab Dashboard
   */
  async getLabStats(labUserId?: string) {
    const where: any = {};
    if (labUserId) {
      const lab = await this.prisma.labProfile.findUnique({
        where: { userId: labUserId },
      });
      if (lab) where.labId = lab.id;
    }

    const [total, pending, sampleCollected, processing, reportReady, revenueAgg] =
      await Promise.all([
        this.prisma.labOrder.count({ where }),
        this.prisma.labOrder.count({
          where: { ...where, status: LabOrderStatus.PENDING },
        }),
        this.prisma.labOrder.count({
          where: { ...where, status: LabOrderStatus.SAMPLE_COLLECTED },
        }),
        this.prisma.labOrder.count({
          where: { ...where, status: LabOrderStatus.PROCESSING },
        }),
        this.prisma.labOrder.count({
          where: { ...where, status: LabOrderStatus.REPORT_READY },
        }),
        this.prisma.labOrder.aggregate({
          where,
          _sum: { totalFee: true },
        }),
      ]);

    return {
      totalRequisitions: total,
      pendingPickups: pending,
      sampleCollected,
      inLabProcessing: processing,
      reportsReady: reportReady,
      totalRevenue: revenueAgg._sum.totalFee || 0,
    };
  }

  /**
   * PUT /api/v1/labs/orders/:id/assign-technician
   * Dispatch a phlebotomist with geolocation coordinates
   */
  async assignTechnician(orderId: string, dto: AssignTechnicianDto) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    const updatedOrder = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        technicianName: dto.technicianName,
        technicianPhone: dto.technicianPhone,
        technicianLatitude: dto.latitude,
        technicianLongitude: dto.longitude,
        status: LabOrderStatus.SAMPLE_COLLECTED,
      },
      include: {
        patient: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
        lab: { select: { id: true, labName: true } },
      },
    });

    this.logger.log(
      `Dispatched phlebotomist ${dto.technicianName} (${dto.technicianPhone}) to LabOrder ${orderId} at coords [${dto.latitude}, ${dto.longitude}]`,
    );

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      dispatchedTechnician: {
        name: updatedOrder.technicianName,
        phone: updatedOrder.technicianPhone,
        location: {
          latitude: updatedOrder.technicianLatitude,
          longitude: updatedOrder.technicianLongitude,
        },
        dispatchedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * POST /api/v1/labs/orders/:id/upload-report
   * Upload lab report PDF with encryption and patient SMS notification dispatch
   */
  async uploadReport(orderId: string, file?: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'A valid PDF report file is required for upload',
      );
    }

    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        patient: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
        lab: { select: { id: true, labName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    // 1. Encrypt PDF report buffer using AES-256-GCM authenticated encryption
    const encryptedResult = this.cryptoService.encryptPdfBuffer(file.buffer);

    // 2. Upload encrypted PDF buffer to private S3 bucket
    const key = `lab-reports/${order.labId}/${orderId}_encrypted.pdf`;
    const uploadResult = await this.s3Service.uploadBuffer(
      encryptedResult.encryptedBuffer,
      key,
      'application/pdf',
    );

    // 3. Update LabOrder record in DB
    const updatedOrder = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        reportPdfUrl: uploadResult.presignedUrl,
        isEncrypted: true,
        status: LabOrderStatus.REPORT_READY,
      },
    });

    // 4. Dispatch patient SMS notification
    const patientName = order.patient?.user?.name || 'Patient';
    const patientPhone = order.patient?.user?.phone || '8801700000000';

    const smsResult = await this.cryptoService.dispatchPatientSms({
      patientName,
      patientPhone,
      orderId,
      reportUrl: uploadResult.presignedUrl,
    });

    this.logger.log(
      `Successfully uploaded encrypted lab report PDF for order ${orderId} and dispatched patient SMS`,
    );

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      reportPdfUrl: uploadResult.presignedUrl,
      isEncrypted: true,
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        iv: encryptedResult.ivHex,
        authTag: encryptedResult.authTagHex,
      },
      smsDispatch: smsResult,
    };
  }
}
