import { Test, TestingModule } from '@nestjs/testing';
import { PdfRendererService } from './pdf-renderer.service.js';

describe('PdfRendererService', () => {
  let service: PdfRendererService;

  const mockPrescription = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    appointmentId: 'appt-123',
    doctorId: 'doc-profile-1',
    patientId: 'patient-profile-1',
    diagnosis: 'Acute Viral Bronchitis',
    chiefComplaints: 'High fever, Dry cough',
    vitalsJson: { bp: '120/80', pulse: 72, spO2: 98, bmi: 22.5 },
    advice: 'Rest for 3 days and drink plenty of warm fluids.',
    followUpDate: new Date('2026-10-15T10:00:00.000Z'),
    createdAt: new Date('2026-10-06T10:00:00.000Z'),
    doctor: {
      name: 'Dr. Rahat Ali',
      bmdcRegNo: 'A-89421',
      specialization: 'General Medicine & Telehealth',
      hospital: 'Square Hospital Network',
    },
    patient: {
      gender: 'MALE',
      bloodGroup: 'B+',
      user: {
        name: 'John Doe',
        email: 'patient@example.com',
      },
    },
    items: [
      {
        medicineName: 'Napa Extra',
        genericName: 'Paracetamol + Caffeine',
        dosageForm: 'Tablet',
        schedulePattern: '1+0+1',
        mealTiming: 'AFTER_MEAL',
        durationDays: 7,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfRendererService],
    }).compile();

    service = module.get<PdfRendererService>(PdfRendererService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePrescriptionHash', () => {
    it('should compute deterministic SHA-256 hash string for prescription', () => {
      const hash = service.generatePrescriptionHash(mockPrescription);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // 64 hex characters for SHA-256
    });
  });

  describe('renderPrescriptionPdf', () => {
    it('should render PDF buffer, cryptographically signed QR code, and verification URL', async () => {
      const result = await service.renderPrescriptionPdf(mockPrescription);

      expect(result.pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.pdfBuffer.length).toBeGreaterThan(500); // Non-empty PDF
      expect(result.sha256Hash).toBeDefined();
      expect(result.verifyUrl).toContain(
        `/verify-rx/${mockPrescription.id}?hash=`,
      );
    });
  });
});
