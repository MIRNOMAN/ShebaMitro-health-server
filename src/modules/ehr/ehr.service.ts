import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { FilterEhrDto, EhrRecordType } from './dto/filter-ehr.dto.js';

@Injectable()
export class EhrService {
  private readonly logger = new Logger(EhrService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enforce consent policies: Accessible only by the patient or a doctor with a currently active appointment
   */
  async validateEhrConsentPolicy(
    callerUserId: string,
    callerRole: string,
    targetPatientId: string,
  ): Promise<boolean> {
    // 1. System Admin has unrestricted access
    if (callerRole === Role.ADMIN) {
      return true;
    }

    // 2. Patient can access their own EHR record
    if (callerRole === Role.PATIENT) {
      const patientProfile = await this.prisma.patientProfile.findUnique({
        where: { userId: callerUserId },
      });

      if (!patientProfile) {
        throw new NotFoundException(`Patient profile not found for user ID ${callerUserId}`);
      }

      if (patientProfile.id !== targetPatientId) {
        this.logger.warn(
          `Consent Policy Violation: Patient ${patientProfile.id} attempted to access EHR of patient ${targetPatientId}`,
        );
        throw new ForbiddenException(
          'Access denied. Patients can only access their own Electronic Health Record.',
        );
      }

      return true;
    }

    // 3. Doctor access requires a currently active appointment with this patient
    if (callerRole === Role.DOCTOR) {
      const doctorProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: callerUserId },
      });

      if (!doctorProfile) {
        throw new NotFoundException(`Doctor profile not found for user ID ${callerUserId}`);
      }

      const now = new Date();
      // Allow 1 hour pre/post buffer around appointment window
      const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + 60 * 60 * 1000);

      const activeAppointment = await this.prisma.appointment.findFirst({
        where: {
          patientId: targetPatientId,
          doctorId: doctorProfile.id,
          status: {
            in: [
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.IN_PROGRESS,
              AppointmentStatus.COMPLETED,
            ],
          },
          slotStartTime: { lte: windowEnd },
          slotEndTime: { gte: windowStart },
        },
      });

      if (!activeAppointment) {
        // Fallback: check if doctor has any confirmed/in-progress appointment for today with patient
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const todayEnd = new Date(now.setHours(23, 59, 59, 999));

        const todayAppointment = await this.prisma.appointment.findFirst({
          where: {
            patientId: targetPatientId,
            doctorId: doctorProfile.id,
            status: {
              in: [
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.IN_PROGRESS,
                AppointmentStatus.COMPLETED,
              ],
            },
            slotStartTime: { gte: todayStart, lte: todayEnd },
          },
        });

        if (!todayAppointment) {
          this.logger.warn(
            `Consent Policy Violation: Doctor ${doctorProfile.id} attempted EHR access for patient ${targetPatientId} without active appointment`,
          );
          throw new ForbiddenException(
            'Consent Policy Enforced: Patient Electronic Health Record is accessible only by the patient or a doctor with a currently active appointment.',
          );
        }
      }

      this.logger.log(
        `Consent Policy Verified: Doctor ${doctorProfile.id} granted EHR access for patient ${targetPatientId} via active appointment`,
      );

      return true;
    }

    throw new ForbiddenException('Access denied. Insufficient permissions to access EHR.');
  }

  /**
   * GET /api/v1/ehr/patient/:id
   * Aggregate historical visits, doctor diagnoses, lab reports, and medication histories with filtering
   */
  async getPatientEhr(
    callerUserId: string,
    callerRole: string,
    targetPatientId: string,
    dto: FilterEhrDto,
  ) {
    // 1. Enforce strict consent policy check
    await this.validateEhrConsentPolicy(callerUserId, callerRole, targetPatientId);

    // 2. Fetch Patient Profile details
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: targetPatientId },
      include: {
        user: { select: { name: true, email: true, phone: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient profile with ID ${targetPatientId} not found`);
    }

    const { from, to, recordType, doctorSpecialty, page = 1, limit = 10 } = dto;

    // Date range filter clause
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // 3. Aggregate Historical Visits (Appointments)
    const appointmentWhere: any = { patientId: targetPatientId };
    if (hasDateFilter) appointmentWhere.slotStartTime = dateFilter;
    if (doctorSpecialty) {
      appointmentWhere.doctor = {
        specialization: { contains: doctorSpecialty, mode: 'insensitive' },
      };
    }

    const appointments = await this.prisma.appointment.findMany({
      where: appointmentWhere,
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            hospital: true,
            bmdcRegNo: true,
          },
        },
        prescription: {
          select: {
            id: true,
            diagnosis: true,
            chiefComplaints: true,
            pdfUrl: true,
          },
        },
      },
      orderBy: { slotStartTime: 'desc' },
    });

    // 4. Aggregate Prescriptions & Doctor Diagnoses
    const prescriptionWhere: any = { patientId: targetPatientId };
    if (hasDateFilter) prescriptionWhere.createdAt = dateFilter;
    if (doctorSpecialty) {
      prescriptionWhere.doctor = {
        specialization: { contains: doctorSpecialty, mode: 'insensitive' },
      };
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where: prescriptionWhere,
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
            bmdcRegNo: true,
            hospital: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 5. Aggregate Lab Reports
    const labOrderWhere: any = { patientId: targetPatientId };
    if (hasDateFilter) labOrderWhere.createdAt = dateFilter;

    const labReports = await this.prisma.labOrder.findMany({
      where: labOrderWhere,
      include: {
        lab: {
          select: {
            id: true,
            labName: true,
            address: true,
            accreditation: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 6. Aggregate Medication Histories
    const medicationReminders = await this.prisma.medicineReminder.findMany({
      where: { patientId: targetPatientId },
      include: {
        prescriptionItem: true,
      },
      orderBy: { intakeTime: 'desc' },
      take: 20,
    });

    // 7. Apply recordType filtering if requested
    let filteredVisits = appointments;
    let filteredPrescriptions = prescriptions;
    let filteredLabReports = labReports;
    let filteredClinicalNotes: any[] = [];

    if (recordType === EhrRecordType.PRESCRIPTION) {
      filteredVisits = [];
      filteredLabReports = [];
    } else if (recordType === EhrRecordType.LAB_REPORT) {
      filteredVisits = [];
      filteredPrescriptions = [];
    } else if (recordType === EhrRecordType.CLINICAL_NOTE) {
      filteredPrescriptions = [];
      filteredLabReports = [];

      filteredClinicalNotes = appointments.map((appt) => ({
        appointmentId: appt.id,
        date: appt.slotStartTime,
        doctorName: appt.doctor?.name,
        specialization: appt.doctor?.specialization,
        notes: appt.notes || 'Routine consultation',
        diagnosis: appt.prescription?.diagnosis || null,
        chiefComplaints: appt.prescription?.chiefComplaints || null,
      }));
    }

    this.logger.log(
      `Successfully aggregated EHR for patient ${targetPatientId}: ${appointments.length} visits, ${prescriptions.length} prescriptions, ${labReports.length} lab reports`,
    );

    return {
      patientDemographics: {
        id: patient.id,
        name: patient.user?.name || 'Patient',
        email: patient.user?.email,
        phone: patient.user?.phone,
        bloodGroup: patient.bloodGroup,
        dob: patient.dob,
        gender: patient.gender,
        emergencyContact: patient.emergencyContact,
        medicalAllergies: patient.medicalAllergies,
      },
      consentVerified: true,
      appliedFilters: {
        dateRange: { from: from || null, to: to || null },
        recordType: recordType || 'ALL',
        doctorSpecialty: doctorSpecialty || 'ALL',
      },
      summary: {
        totalVisitsCount: appointments.length,
        totalPrescriptionsCount: prescriptions.length,
        totalLabReportsCount: labReports.length,
        totalMedicationsCount: medicationReminders.length,
      },
      records: {
        historicalVisits: filteredVisits,
        prescriptions: filteredPrescriptions,
        labReports: filteredLabReports,
        clinicalNotes: filteredClinicalNotes,
        medicationHistories: medicationReminders,
      },
    };
  }
}
