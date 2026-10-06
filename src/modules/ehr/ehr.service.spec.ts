import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, AppointmentStatus } from '@prisma/client';
import { EhrService } from './ehr.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { EhrRecordType } from './dto/filter-ehr.dto.js';

describe('EhrService', () => {
  let service: EhrService;
  let prismaService: any;

  const mockPatientProfile = {
    id: 'patient-123',
    userId: 'user-patient-123',
    bloodGroup: 'O+',
    dob: new Date('1990-01-01'),
    gender: 'Male',
    emergencyContact: '01711111111',
    medicalAllergies: ['Penicillin'],
    user: { name: 'Abdul', email: 'abdul@example.com', phone: '01700000000' },
  };

  const mockDoctorProfile = {
    id: 'doctor-456',
    userId: 'user-doctor-456',
    name: 'Dr. Rahat Ali',
    specialization: 'Cardiology',
    bmdcRegNo: 'A-12345',
  };

  const mockAppointment = {
    id: 'appt-999',
    patientId: 'patient-123',
    doctorId: 'doctor-456',
    slotStartTime: new Date(),
    slotEndTime: new Date(Date.now() + 30 * 60 * 1000),
    type: 'ONLINE',
    status: AppointmentStatus.IN_PROGRESS,
    doctor: {
      name: 'Dr. Rahat Ali',
      specialization: 'Cardiology',
      hospital: 'Square Hospital',
      bmdcRegNo: 'A-12345',
    },
    prescription: {
      id: 'rx-111',
      diagnosis: 'Hypertension',
      chiefComplaints: 'High BP, Headache',
      pdfUrl: 'https://s3.amazonaws.com/rx.pdf',
    },
  };

  const mockPrescription = {
    id: 'rx-111',
    patientId: 'patient-123',
    doctorId: 'doctor-456',
    diagnosis: 'Hypertension',
    chiefComplaints: 'High BP',
    advice: 'Low salt diet',
    createdAt: new Date(),
    doctor: {
      id: 'doctor-456',
      name: 'Dr. Rahat Ali',
      specialization: 'Cardiology',
      bmdcRegNo: 'A-12345',
      hospital: 'Square Hospital',
    },
    items: [
      {
        id: 'item-1',
        medicineName: 'Amlodipine 5mg',
        genericName: 'Amlodipine',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+0',
        durationDays: 30,
      },
    ],
  };

  const mockLabReport = {
    id: 'lab-order-1',
    patientId: 'patient-123',
    testNames: ['Lipid Profile', 'ECG'],
    totalFee: 1500,
    status: 'REPORT_READY',
    reportPdfUrl: 'https://s3.amazonaws.com/lab-report.pdf',
    isEncrypted: true,
    createdAt: new Date(),
    lab: {
      id: 'lab-1',
      labName: 'Popular Diagnostic',
      address: 'Dhanmondi',
      accreditation: 'ISO15189',
    },
  };

  beforeEach(async () => {
    prismaService = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(mockPatientProfile),
      },
      doctorProfile: {
        findUnique: jest.fn().mockResolvedValue(mockDoctorProfile),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(mockAppointment),
        findMany: jest.fn().mockResolvedValue([mockAppointment]),
      },
      prescription: {
        findMany: jest.fn().mockResolvedValue([mockPrescription]),
      },
      labOrder: {
        findMany: jest.fn().mockResolvedValue([mockLabReport]),
      },
      medicineReminder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EhrService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<EhrService>(EhrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateEhrConsentPolicy', () => {
    it('should allow patient to access their own EHR record', async () => {
      const result = await service.validateEhrConsentPolicy(
        'user-patient-123',
        Role.PATIENT,
        'patient-123',
      );
      expect(result).toBe(true);
    });

    it('should throw 403 Forbidden if patient tries to access another patient EHR', async () => {
      await expect(
        service.validateEhrConsentPolicy(
          'user-patient-123',
          Role.PATIENT,
          'other-patient-456',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow doctor with an active appointment to access patient EHR', async () => {
      const result = await service.validateEhrConsentPolicy(
        'user-doctor-456',
        Role.DOCTOR,
        'patient-123',
      );
      expect(result).toBe(true);
    });

    it('should throw 403 Forbidden if doctor does NOT have an active appointment', async () => {
      prismaService.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.validateEhrConsentPolicy(
          'user-doctor-456',
          Role.DOCTOR,
          'patient-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPatientEhr', () => {
    it('should aggregate patient historical visits, prescriptions, lab reports, and medication histories', async () => {
      const dto = {};
      const result = await service.getPatientEhr(
        'user-patient-123',
        Role.PATIENT,
        'patient-123',
        dto,
      );

      expect(result.patientDemographics.name).toBe('Abdul');
      expect(result.summary.totalVisitsCount).toBe(1);
      expect(result.records.historicalVisits.length).toBe(1);
      expect(result.records.prescriptions.length).toBe(1);
      expect(result.records.labReports.length).toBe(1);
    });

    it('should filter by recordType PRESCRIPTION', async () => {
      const dto = { recordType: EhrRecordType.PRESCRIPTION };
      const result = await service.getPatientEhr(
        'user-patient-123',
        Role.PATIENT,
        'patient-123',
        dto,
      );

      expect(result.records.historicalVisits.length).toBe(0);
      expect(result.records.prescriptions.length).toBe(1);
      expect(result.records.labReports.length).toBe(0);
    });
  });
});
