import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SymptomTriageService, MANDATORY_MEDICAL_DISCLAIMER } from './symptom-triage.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('SymptomTriageService', () => {
  let service: SymptomTriageService;
  let prisma: any;

  const mockCardiologist = {
    id: 'doc-cardio-1',
    userId: 'user-cardio-1',
    name: 'Dr. Shahin Rahman',
    specialization: 'Cardiology',
    qualifications: ['MBBS', 'FCPS (Cardiology)'],
    experienceYears: 15,
    consultFee: 1200,
    followUpFee: 700,
    rating: 4.9,
    reviewCount: 120,
    hospital: 'National Heart Foundation',
    bmdcRegNo: 'BMDC-A-1001',
    isApproved: true,
    user: {
      id: 'user-cardio-1',
      name: 'Dr. Shahin Rahman',
      email: 'shahin@heartfoundation.org',
      phone: '01711111111',
    },
  };

  const mockGeneralPhysician = {
    id: 'doc-gen-2',
    userId: 'user-gen-2',
    name: 'Dr. Nusrat Jahan',
    specialization: 'General Medicine',
    qualifications: ['MBBS', 'MCPS'],
    experienceYears: 8,
    consultFee: 800,
    followUpFee: 500,
    rating: 4.8,
    reviewCount: 95,
    hospital: 'Dhaka Medical College',
    bmdcRegNo: 'BMDC-A-2002',
    isApproved: true,
    user: {
      id: 'user-gen-2',
      name: 'Dr. Nusrat Jahan',
      email: 'nusrat@dmch.gov.bd',
      phone: '01722222222',
    },
  };

  const mockNeurologist = {
    id: 'doc-neuro-3',
    userId: 'user-neuro-3',
    name: 'Dr. Farhana Ahmed',
    specialization: 'Neurology',
    qualifications: ['MBBS', 'MD (Neurology)'],
    experienceYears: 12,
    consultFee: 1500,
    followUpFee: 800,
    rating: 4.95,
    reviewCount: 150,
    hospital: 'Square Hospital',
    bmdcRegNo: 'BMDC-A-3003',
    isApproved: true,
    user: {
      id: 'user-neuro-3',
      name: 'Dr. Farhana Ahmed',
      email: 'farhana@squarehospital.com',
      phone: '01733333333',
    },
  };

  beforeEach(async () => {
    prisma = {
      doctorProfile: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where?.OR) {
            return [mockCardiologist, mockGeneralPhysician, mockNeurologist];
          }
          return [mockCardiologist, mockGeneralPhysician, mockNeurologist];
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymptomTriageService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) },
        },
      ],
    }).compile();

    service = module.get<SymptomTriageService>(SymptomTriageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triageSymptoms', () => {
    it('should classify severe chest pain as EMERGENCY and return top 3 matching doctors with disclaimer', async () => {
      const dto = {
        symptoms: 'Crushing chest pain radiating to arm and difficulty breathing',
        duration: '30 minutes',
        severity: 'SEVERE',
        age: 55,
        gender: 'Male',
      };

      const result = await service.triageSymptoms(dto);

      expect(result.urgency).toBe('EMERGENCY');
      expect(result.urgencyLabel).toContain('Emergency');
      expect(result.matchingSpecialties).toContain('Cardiology');
      expect(result.topMatchingDoctors.length).toBe(3);
      expect(result.topMatchingDoctors[0].specialization).toBe('Cardiology');
      expect(result.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
      expect(result.redFlags.length).toBeGreaterThan(0);
    });

    it('should classify high fever and stomach pain as MODERATE urgency', async () => {
      const dto = {
        symptoms: 'High fever and severe abdominal pain',
        duration: '2 days',
        severity: 'MODERATE',
      };

      const result = await service.triageSymptoms(dto);

      expect(result.urgency).toBe('MODERATE');
      expect(result.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
      expect(result.topMatchingDoctors.length).toBeGreaterThan(0);
    });

    it('should classify mild cold as NON_URGENT urgency', async () => {
      const dto = {
        symptoms: 'Mild runny nose and slight cough',
        duration: '3 days',
        severity: 'MILD',
      };

      const result = await service.triageSymptoms(dto);

      expect(result.urgency).toBe('NON_URGENT');
      expect(result.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
    });

    it('should execute fallback doctor search if matching specialty query returns fewer than 3 doctors', async () => {
      // First findMany returns only 1 doctor, second call returns fallback
      prisma.doctorProfile.findMany
        .mockResolvedValueOnce([mockCardiologist])
        .mockResolvedValueOnce([mockGeneralPhysician, mockNeurologist]);

      const dto = {
        symptoms: 'Severe heart palpitations',
        duration: '1 hour',
        severity: 'SEVERE',
      };

      const result = await service.triageSymptoms(dto);

      expect(result.topMatchingDoctors.length).toBe(3);
      expect(prisma.doctorProfile.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
