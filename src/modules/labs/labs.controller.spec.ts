import { Test, TestingModule } from '@nestjs/testing';
import { LabOrderStatus } from '@prisma/client';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';

describe('LabsController', () => {
  let controller: LabsController;
  let labsService: any;

  const mockSearchResponse = {
    data: [
      {
        id: 'test-789',
        testName: 'Complete Blood Count (CBC)',
        category: 'Hematology',
        price: 450,
      },
    ],
    meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };

  const mockOrderResponse = {
    id: 'order-999',
    patientId: 'patient-456',
    labId: 'lab-123',
    testNames: ['Complete Blood Count (CBC)'],
    totalFee: 600,
    status: LabOrderStatus.PENDING,
  };

  const mockAssignResponse = {
    orderId: 'order-999',
    status: LabOrderStatus.SAMPLE_COLLECTED,
    dispatchedTechnician: {
      name: 'Tariqul Islam',
      phone: '+8801711223344',
      location: { latitude: 23.7937, longitude: 90.4066 },
    },
  };

  const mockUploadResponse = {
    orderId: 'order-999',
    status: LabOrderStatus.REPORT_READY,
    reportPdfUrl: 'https://s3.amazonaws.com/presigned-lab-report-url',
    isEncrypted: true,
  };

  beforeEach(async () => {
    labsService = {
      searchLabTests: jest.fn().mockResolvedValue(mockSearchResponse),
      createLabOrder: jest.fn().mockResolvedValue(mockOrderResponse),
      assignTechnician: jest.fn().mockResolvedValue(mockAssignResponse),
      uploadReport: jest.fn().mockResolvedValue(mockUploadResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabsController],
      providers: [{ provide: LabsService, useValue: labsService }],
    }).compile();

    controller = module.get<LabsController>(LabsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('searchLabTests', () => {
    it('should return paginated lab tests matching filter parameters', async () => {
      const dto = { search: 'CBC', category: 'Hematology' };
      const result = await controller.searchLabTests(dto);

      expect(labsService.searchLabTests).toHaveBeenCalledWith(dto);
      expect(result.data.length).toBe(1);
    });
  });

  describe('createLabOrder', () => {
    it('should book home sample collection order', async () => {
      const dto = {
        labId: 'lab-123',
        testNames: ['Complete Blood Count (CBC)'],
        sampleCollectionAddress: 'House 42, Road 11, Banani, Dhaka',
        sampleCollectionSlot: '2026-10-10T08:00:00.000Z',
      };

      const result = await controller.createLabOrder('user-pat-1', dto);

      expect(labsService.createLabOrder).toHaveBeenCalledWith(
        'user-pat-1',
        dto,
      );
      expect(result.id).toBe('order-999');
    });
  });

  describe('assignTechnician', () => {
    it('should dispatch phlebotomist technician with geolocation coordinates', async () => {
      const dto = {
        technicianName: 'Tariqul Islam',
        technicianPhone: '+8801711223344',
        latitude: 23.7937,
        longitude: 90.4066,
      };

      const result = await controller.assignTechnician('order-999', dto);

      expect(labsService.assignTechnician).toHaveBeenCalledWith(
        'order-999',
        dto,
      );
      expect(result.dispatchedTechnician.name).toBe('Tariqul Islam');
    });
  });

  describe('uploadReport', () => {
    it('should upload encrypted lab report PDF and dispatch patient SMS', async () => {
      const mockFile = { buffer: Buffer.from('pdf') } as any;
      const result = await controller.uploadReport('order-999', mockFile);

      expect(labsService.uploadReport).toHaveBeenCalledWith(
        'order-999',
        mockFile,
      );
      expect(result.isEncrypted).toBe(true);
    });
  });
});
