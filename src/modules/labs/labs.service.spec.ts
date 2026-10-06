import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LabOrderStatus } from '@prisma/client';
import { LabsService } from './labs.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { LabReportCryptoService } from './lab-report-crypto.service.js';

describe('LabsService', () => {
  let service: LabsService;
  let prismaService: any;
  let s3Service: any;
  let cryptoService: any;

  const mockLabProfile = {
    id: 'lab-123',
    labName: 'Popular Diagnostic Center',
    address: 'Dhanmondi, Dhaka',
    accreditation: 'ISO15189',
  };

  const mockPatientProfile = {
    id: 'patient-456',
    userId: 'user-pat-1',
    user: { name: 'Abdul', phone: '8801700000000', email: 'abdul@example.com' },
  };

  const mockLabTest = {
    id: 'test-789',
    labId: 'lab-123',
    testName: 'Complete Blood Count (CBC)',
    category: 'Hematology',
    price: 450,
    fastingRequired: false,
    turnaroundHours: 12,
    labAccreditation: 'ISO15189',
    lab: mockLabProfile,
  };

  const mockLabOrder = {
    id: 'order-999',
    patientId: 'patient-456',
    labId: 'lab-123',
    testNames: ['Complete Blood Count (CBC)'],
    totalFee: 600,
    sampleCollectionAddress: 'House 42, Road 11, Banani, Dhaka',
    sampleCollectionSlot: new Date('2026-10-10T08:00:00.000Z'),
    status: LabOrderStatus.PENDING,
    patient: mockPatientProfile,
    lab: mockLabProfile,
  };

  beforeEach(async () => {
    prismaService = {
      labTest: {
        findMany: jest.fn().mockResolvedValue([mockLabTest]),
        count: jest.fn().mockResolvedValue(1),
      },
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      labProfile: {
        findUnique: jest.fn().mockResolvedValue(mockLabProfile),
      },
      labOrder: {
        create: jest.fn().mockResolvedValue(mockLabOrder),
        findUnique: jest.fn().mockResolvedValue(mockLabOrder),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...mockLabOrder,
          ...data,
        })),
      },
    };

    s3Service = {
      uploadBuffer: jest.fn().mockResolvedValue({
        key: 'lab-reports/lab-123/order-999_encrypted.pdf',
        presignedUrl: 'https://s3.amazonaws.com/presigned-lab-report-url',
      }),
    };

    cryptoService = {
      encryptPdfBuffer: jest.fn().mockReturnValue({
        encryptedBuffer: Buffer.from('encrypted-pdf-data'),
        ivHex: '1234567890abcdef12345678',
        authTagHex: '1234567890abcdef1234567890abcdef',
      }),
      dispatchPatientSms: jest.fn().mockResolvedValue({
        success: true,
        recipient: '8801700000000',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: S3Service, useValue: s3Service },
        { provide: LabReportCryptoService, useValue: cryptoService },
      ],
    }).compile();

    service = module.get<LabsService>(LabsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchLabTests', () => {
    it('should query lab tests with search string, category, fasting, turnaround, and price filters', async () => {
      const dto = {
        search: 'CBC',
        category: 'Hematology',
        fastingRequired: false,
        turnaroundTime: 24,
        minPrice: 100,
        maxPrice: 1000,
        labAccreditation: 'ISO15189',
        page: 1,
        limit: 10,
      };

      const result = await service.searchLabTests(dto);

      expect(prismaService.labTest.findMany).toHaveBeenCalled();
      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('createLabOrder', () => {
    it('should calculate total fee and create home sample collection order', async () => {
      const dto = {
        labId: 'lab-123',
        testNames: ['Complete Blood Count (CBC)'],
        sampleCollectionAddress: 'House 42, Road 11, Banani, Dhaka',
        sampleCollectionSlot: '2026-10-10T08:00:00.000Z',
      };

      const result = await service.createLabOrder('user-pat-1', dto);

      expect(prismaService.labOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient-456',
            labId: 'lab-123',
            testNames: ['Complete Blood Count (CBC)'],
            totalFee: 600, // 450 + 150 surcharge
            status: LabOrderStatus.PENDING,
          }),
        }),
      );

      expect(result.id).toBe('order-999');
    });

    it('should throw NotFoundException if lab profile does not exist', async () => {
      prismaService.labProfile.findUnique.mockResolvedValueOnce(null);

      const dto = {
        labId: 'invalid-lab',
        testNames: ['CBC'],
        sampleCollectionAddress: 'Address',
        sampleCollectionSlot: '2026-10-10T08:00:00.000Z',
      };

      await expect(service.createLabOrder('user-pat-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignTechnician', () => {
    it('should update order with phlebotomist details and geolocation coordinates', async () => {
      const dto = {
        technicianName: 'Tariqul Islam',
        technicianPhone: '+8801711223344',
        latitude: 23.7937,
        longitude: 90.4066,
      };

      const result = await service.assignTechnician('order-999', dto);

      expect(prismaService.labOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-999' },
        data: {
          technicianName: 'Tariqul Islam',
          technicianPhone: '+8801711223344',
          technicianLatitude: 23.7937,
          technicianLongitude: 90.4066,
          status: LabOrderStatus.SAMPLE_COLLECTED,
        },
        include: expect.any(Object),
      });

      expect(result.dispatchedTechnician.name).toBe('Tariqul Islam');
      expect(result.dispatchedTechnician.location.latitude).toBe(23.7937);
    });
  });

  describe('uploadReport', () => {
    it('should encrypt PDF report buffer, upload to S3, and dispatch patient SMS', async () => {
      const mockFile = {
        buffer: Buffer.from('mock-pdf-content'),
        mimetype: 'application/pdf',
      } as any;

      const result = await service.uploadReport('order-999', mockFile);

      expect(cryptoService.encryptPdfBuffer).toHaveBeenCalledWith(
        mockFile.buffer,
      );
      expect(s3Service.uploadBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'lab-reports/lab-123/order-999_encrypted.pdf',
        'application/pdf',
      );
      expect(cryptoService.dispatchPatientSms).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-999',
          patientName: 'Abdul',
          patientPhone: '8801700000000',
        }),
      );

      expect(result.isEncrypted).toBe(true);
      expect(result.reportPdfUrl).toBe(
        'https://s3.amazonaws.com/presigned-lab-report-url',
      );
    });

    it('should throw BadRequestException if file is missing', async () => {
      await expect(service.uploadReport('order-999', undefined)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
