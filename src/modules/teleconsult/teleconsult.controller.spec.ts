import { Test, TestingModule } from '@nestjs/testing';
import { TeleconsultController } from './teleconsult.controller.js';
import { TeleconsultService } from './teleconsult.service.js';

describe('TeleconsultController', () => {
  let controller: TeleconsultController;
  let service: any;

  const mockTokenResult = {
    appointmentId: 'appt-tele-1',
    channelName: 'teleconsult_appt-tele-1',
    token: 'test-rtc-token-abc-123',
    role: 'PUBLISHER',
    uid: 'user-doc-1',
    expiresAt: new Date().toISOString(),
    slotStartTime: new Date(),
    slotEndTime: new Date(),
  };

  beforeEach(async () => {
    service = {
      generateRtcToken: jest.fn().mockResolvedValue(mockTokenResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeleconsultController],
      providers: [{ provide: TeleconsultService, useValue: service }],
    }).compile();

    controller = module.get<TeleconsultController>(TeleconsultController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /teleconsult/:appointmentId/token', () => {
    it('should return dynamic RTC access token', async () => {
      const result = await controller.getRtcToken('appt-tele-1', 'user-doc-1');

      expect(service.generateRtcToken).toHaveBeenCalledWith(
        'user-doc-1',
        'appt-tele-1',
      );
      expect(result).toEqual(mockTokenResult);
    });
  });
});
