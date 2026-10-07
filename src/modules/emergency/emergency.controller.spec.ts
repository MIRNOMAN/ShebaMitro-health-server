import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { EmergencyController } from './emergency.controller.js';
import { EmergencyService } from './emergency.service.js';

describe('EmergencyController', () => {
  let controller: EmergencyController;
  let service: any;

  const mockSosResponse = {
    success: true,
    message: 'Emergency SOS dispatched successfully',
    sosId: 'sos-req-123',
    trackingToken: 'sos_tr_abc',
    trackingUrl: 'https://shebamitro.health/track/sos/sos_tr_abc',
    smsSent: true,
    dispatchedAmbulance: { id: 'amb-1', driverName: 'Rafiq' },
    nearestHospital: { id: 'hosp-1', name: 'DMCH' },
  };

  beforeEach(async () => {
    service = {
      triggerSos: jest.fn().mockResolvedValue(mockSosResponse),
      getTrackingStatus: jest.fn().mockResolvedValue({ sosId: 'sos-req-123', status: 'DISPATCHED' }),
      updateAmbulanceLocation: jest.fn().mockResolvedValue({ id: 'amb-1', latitude: 23.8, longitude: 90.4 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmergencyController],
      providers: [{ provide: EmergencyService, useValue: service }],
    }).compile();

    controller = module.get<EmergencyController>(EmergencyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerSos', () => {
    it('should delegate SOS request to emergencyService.triggerSos', async () => {
      const dto = { latitude: 23.81, longitude: 90.41 };
      const result = await controller.triggerSos('user-1', Role.PATIENT, dto);

      expect(service.triggerSos).toHaveBeenCalledWith('user-1', Role.PATIENT, dto);
      expect(result).toEqual(mockSosResponse);
    });
  });

  describe('getTrackingStatus', () => {
    it('should delegate tracking request to emergencyService.getTrackingStatus', async () => {
      const result = await controller.getTrackingStatus('sos_tr_abc');
      expect(service.getTrackingStatus).toHaveBeenCalledWith('sos_tr_abc');
      expect(result.sosId).toBe('sos-req-123');
    });
  });

  describe('updateAmbulanceLocation', () => {
    it('should delegate location update to emergencyService.updateAmbulanceLocation', async () => {
      const result = await controller.updateAmbulanceLocation('amb-1', { latitude: 23.8, longitude: 90.4 });
      expect(service.updateAmbulanceLocation).toHaveBeenCalledWith('amb-1', 23.8, 90.4);
      expect(result.id).toBe('amb-1');
    });
  });
});
