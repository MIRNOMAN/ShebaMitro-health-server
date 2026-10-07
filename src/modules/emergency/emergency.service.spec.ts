import { Test, TestingModule } from '@nestjs/testing';
import { EmergencyService } from './emergency.service.js';
import { EmergencyGateway } from './emergency.gateway.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../common/redis/redis.service.js';

describe('EmergencyService', () => {
  let service: EmergencyService;
  let prisma: any;
  let redisService: any;
  let gateway: any;
  let smsAdapter: any;

  const mockAmbulance = {
    id: 'amb-101',
    driverName: 'Rafiqul Islam',
    driverPhone: '+8801711002233',
    vehicleNumber: 'DHAKA-METRO-CH-11-2026',
    isVerified: true,
    isAvailable: true,
    latitude: 23.812,
    longitude: 90.415,
  };

  const mockHospital = {
    id: 'hosp-201',
    name: 'Evercare Hospital Dhaka',
    address: 'Plot 81, Block E, Bashundhara R/A, Dhaka 1229',
    phone: '+88028431661',
    isVerified: true,
    latitude: 23.8116,
    longitude: 90.4312,
  };

  const mockEmergencyRequest = {
    id: 'sos-req-555',
    patientId: 'patient-123',
    latitude: 23.8103,
    longitude: 90.4125,
    status: 'DISPATCHED',
    trackingToken: 'sos_tr_test123',
    trackingExpiresAt: new Date(Date.now() + 7200000),
    dispatchedAmbulanceId: 'amb-101',
    nearestHospitalId: 'hosp-201',
    createdAt: new Date(),
    dispatchedAmbulance: mockAmbulance,
    nearestHospital: mockHospital,
  };

  beforeEach(async () => {
    prisma = {
      hospital: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockHospital]),
        findUnique: jest.fn().mockResolvedValue(mockHospital),
        createMany: jest.fn(),
      },
      ambulance: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockAmbulance]),
        findUnique: jest.fn().mockResolvedValue(mockAmbulance),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockAmbulance, ...data })),
        createMany: jest.fn(),
      },
      patientProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'patient-123',
          emergencyContact: '+8801799887766',
          user: { name: 'Rahim Uddin', phone: '+8801700112233' },
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'patient-123',
          emergencyContact: '+8801799887766',
          user: { name: 'Rahim Uddin', phone: '+8801700112233' },
        }),
      },
      emergencyRequest: {
        create: jest.fn().mockResolvedValue(mockEmergencyRequest),
        findUnique: jest.fn().mockResolvedValue(mockEmergencyRequest),
      },
    };

    redisService = {
      getRawClient: jest.fn().mockReturnValue({
        call: jest.fn().mockImplementation((command: string) => {
          if (command === 'GEOSEARCH') {
            return Promise.resolve([
              ['amb-101', '0.35', ['90.415', '23.812']],
            ]);
          }
          return Promise.resolve('OK');
        }),
      }),
    };

    gateway = {
      emitAmbulanceDispatch: jest.fn(),
    };

    smsAdapter = {
      sendSms: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        { provide: EmergencyGateway, useValue: gateway },
        { provide: 'SMS_ADAPTER', useValue: smsAdapter },
      ],
    }).compile();

    service = module.get<EmergencyService>(EmergencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerSos', () => {
    it('should execute Redis GEOSEARCH, generate tracking link, send SMS alert, and dispatch to ambulance app', async () => {
      const dto = {
        latitude: 23.8103,
        longitude: 90.4125,
        patientId: 'patient-123',
        emergencyContact: '+8801799887766',
      };

      const result = await service.triggerSos('user-123', 'PATIENT', dto);

      expect(result.success).toBe(true);
      expect(result.trackingToken).toBeDefined();
      expect(result.trackingUrl).toContain('https://shebamitro.health/track/sos/');
      expect(result.dispatchedAmbulance?.id).toBe('amb-101');
      expect(result.nearestHospital?.id).toBe('hosp-201');

      // Verify SMS was sent
      expect(smsAdapter.sendSms).toHaveBeenCalledWith(
        '+8801799887766',
        expect.stringContaining('SHEBAMITRO EMERGENCY SOS ALERT'),
      );

      // Verify WebSocket dispatch
      expect(gateway.emitAmbulanceDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          sosId: 'sos-req-555',
          patientName: 'Rahim Uddin',
        }),
      );
    });
  });

  describe('getTrackingStatus', () => {
    it('should return live GPS tracking status by token', async () => {
      const result = await service.getTrackingStatus('sos_tr_test123');
      expect(result.sosId).toBe('sos-req-555');
      expect(result.isExpired).toBe(false);
      expect(result.patientLocation).toEqual({ latitude: 23.8103, longitude: 90.4125 });
    });
  });

  describe('updateAmbulanceLocation', () => {
    it('should update ambulance coordinates in DB and Redis GEO', async () => {
      const result = await service.updateAmbulanceLocation('amb-101', 23.815, 90.418);
      expect(prisma.ambulance.update).toHaveBeenCalledWith({
        where: { id: 'amb-101' },
        data: { latitude: 23.815, longitude: 90.418 },
      });
      expect(result.latitude).toBe(23.815);
    });
  });
});
