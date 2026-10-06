import { Test, TestingModule } from '@nestjs/testing';
import { DrugSafetyService } from './drug-safety.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('DrugSafetyService', () => {
  let service: DrugSafetyService;
  let prismaService: any;

  const mockPatientProfile = {
    id: 'patient-profile-1',
    medicalAllergies: ['Penicillin', 'Sulfa'],
  };

  beforeEach(async () => {
    prismaService = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'appt-123',
          patient: mockPatientProfile,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrugSafetyService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<DrugSafetyService>(DrugSafetyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifySafety', () => {
    it('should return SAFE for non-interacting and non-allergic medications', async () => {
      const dto = {
        appointmentId: 'appt-123',
        medicines: [
          { medicineName: 'Paracetamol', genericName: 'Acetaminophen' },
          { medicineName: 'Omeprazole', genericName: 'Omeprazole' },
        ],
      };

      const result = await service.verifySafety(dto);

      expect(result.severity).toBe('SAFE');
      expect(result.isBlocked).toBe(false);
      expect(result.requiresOverride).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should return SEVERE conflict for Warfarin + Aspirin interaction', async () => {
      const dto = {
        appointmentId: 'appt-123',
        medicines: [
          { medicineName: 'Warfarin', genericName: 'Coumadin' },
          { medicineName: 'Aspirin', genericName: 'Acetylsalicylic Acid' },
        ],
      };

      const result = await service.verifySafety(dto);

      expect(result.severity).toBe('SEVERE');
      expect(result.isBlocked).toBe(true);
      expect(result.requiresOverride).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('DRUG_DRUG_INTERACTION');
    });

    it('should return SEVERE conflict for patient allergy match (e.g. Penicillin)', async () => {
      const dto = {
        appointmentId: 'appt-123',
        medicines: [
          { medicineName: 'Penicillin V', genericName: 'Penicillin' },
        ],
      };

      const result = await service.verifySafety(dto);

      expect(result.severity).toBe('SEVERE');
      expect(result.isBlocked).toBe(true);
      expect(result.conflicts[0].type).toBe('ALLERGY_CONFLICT');
      expect(result.conflicts[0].allergy).toBe('Penicillin');
    });
  });
});
