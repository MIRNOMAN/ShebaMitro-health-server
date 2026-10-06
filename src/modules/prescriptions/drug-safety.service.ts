import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { VerifyDrugSafetyDto } from './dto/verify-drug-safety.dto.js';

export interface SafetyConflict {
  type: 'DRUG_DRUG_INTERACTION' | 'ALLERGY_CONFLICT';
  medicationA: string;
  medicationB?: string;
  allergy?: string;
  severity: 'MODERATE' | 'SEVERE';
  description: string;
  recommendation: string;
}

export interface DrugSafetyResult {
  severity: 'SAFE' | 'MODERATE' | 'SEVERE';
  isBlocked: boolean;
  requiresOverride: boolean;
  conflicts: SafetyConflict[];
}

interface KnownInteractionRule {
  drugA: string[];
  drugB: string[];
  severity: 'MODERATE' | 'SEVERE';
  description: string;
  recommendation: string;
}

@Injectable()
export class DrugSafetyService {
  private readonly logger = new Logger(DrugSafetyService.name);

  // Known drug-drug interaction database rules
  private readonly interactionRules: KnownInteractionRule[] = [
    {
      drugA: ['warfarin', 'coumadin'],
      drugB: ['aspirin', 'acetylsalicylic acid', 'ibuprofen', 'naproxen'],
      severity: 'SEVERE',
      description:
        'Severe interaction: Combining Warfarin with NSAIDs/Aspirin dramatically increases major internal gastrointestinal hemorrhage and bleeding risks.',
      recommendation:
        'Avoid combination unless strictly monitored with regular INR checks and gastroprotection.',
    },
    {
      drugA: ['sildenafil', 'viagra', 'tadalafil', 'cialis'],
      drugB: ['nitroglycerin', 'isosorbide', 'nitrate'],
      severity: 'SEVERE',
      description:
        'Potentially fatal interaction: Co-administration with Nitrates causes severe unmanageable systemic hypotension.',
      recommendation: 'Absolute contraindication. Do not co-prescribe PDE5 inhibitors with nitrates.',
    },
    {
      drugA: ['clopidogrel', 'plavix'],
      drugB: ['omeprazole', 'losec'],
      severity: 'SEVERE',
      description:
        'Omeprazole significantly reduces antiplatelet activity of Clopidogrel via CYP2C19 inhibition, increasing thrombosis risk.',
      recommendation: 'Use alternative PPI such as Pantoprazole or H2 blocker.',
    },
    {
      drugA: ['enalapril', 'lisinopril', 'losartan'],
      drugB: ['potassium', 'spironolactone'],
      severity: 'SEVERE',
      description: 'High risk of hyperkalemia leading to fatal cardiac arrhythmias.',
      recommendation: 'Monitor serum potassium levels regularly.',
    },
    {
      drugA: ['methotrexate'],
      drugB: ['ibuprofen', 'naproxen', 'diclofenac'],
      severity: 'SEVERE',
      description: 'NSAIDs impair renal clearance of Methotrexate leading to severe bone marrow toxicity.',
      recommendation: 'Avoid concurrent use of NSAIDs with high-dose Methotrexate.',
    },
    {
      drugA: ['paracetamol', 'acetaminophen'],
      drugB: ['alcohol'],
      severity: 'MODERATE',
      description: 'Moderate interaction: Increased hepatotoxicity risk with prolonged high dosing.',
      recommendation: 'Limit total daily dosage to under 3g.',
    },
    {
      drugA: ['ibuprofen'],
      drugB: ['aspirin'],
      severity: 'MODERATE',
      description:
        'Competitive inhibition of platelet COX-1; Ibuprofen interferes with low-dose Aspirin cardio-protection.',
      recommendation: 'Take Aspirin at least 30 minutes before or 8 hours after Ibuprofen.',
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify safety of prescribed medications against drug interaction database tables and patient allergy list
   */
  async verifySafety(dto: VerifyDrugSafetyDto): Promise<DrugSafetyResult> {
    const conflicts: SafetyConflict[] = [];

    // 1. Fetch patient medical allergies if appointmentId or patientId is provided
    let patientAllergies: string[] = [];

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        include: { patient: { select: { medicalAllergies: true } } },
      });
      if (appointment?.patient?.medicalAllergies) {
        patientAllergies = appointment.patient.medicalAllergies;
      }
    } else if (dto.patientId) {
      const patientProfile = await this.prisma.patientProfile.findUnique({
        where: { id: dto.patientId },
        select: { medicalAllergies: true },
      });
      if (patientProfile?.medicalAllergies) {
        patientAllergies = patientProfile.medicalAllergies;
      }
    }

    const meds = dto.medicines || [];

    // 2. Cross-reference prescribed medications against Patient Allergy List
    for (const med of meds) {
      const medName = (med.medicineName || '').toLowerCase();
      const genName = (med.genericName || '').toLowerCase();

      for (const allergy of patientAllergies) {
        const allergyLower = allergy.toLowerCase();
        if (
          medName.includes(allergyLower) ||
          allergyLower.includes(medName) ||
          (genName && (genName.includes(allergyLower) || allergyLower.includes(genName)))
        ) {
          conflicts.push({
            type: 'ALLERGY_CONFLICT',
            medicationA: med.medicineName,
            allergy,
            severity: 'SEVERE',
            description: `Patient allergy conflict: Patient has a documented medical allergy to "${allergy}". Prescribing "${med.medicineName}" carries high risk of hypersensitivity reaction.`,
            recommendation: `Select an alternative medication class that does not contain ${allergy}.`,
          });
        }
      }
    }

    // 3. Cross-reference prescribed medications against Drug-Drug Interaction rules
    for (let i = 0; i < meds.length; i++) {
      for (let j = i + 1; j < meds.length; j++) {
        const nameA = (meds[i].medicineName + ' ' + (meds[i].genericName || '')).toLowerCase();
        const nameB = (meds[j].medicineName + ' ' + (meds[j].genericName || '')).toLowerCase();

        for (const rule of this.interactionRules) {
          const matchAInRuleA = rule.drugA.some((d) => nameA.includes(d));
          const matchBInRuleB = rule.drugB.some((d) => nameB.includes(d));

          const matchBInRuleA = rule.drugA.some((d) => nameB.includes(d));
          const matchAInRuleB = rule.drugB.some((d) => nameA.includes(d));

          if ((matchAInRuleA && matchBInRuleB) || (matchBInRuleA && matchAInRuleB)) {
            conflicts.push({
              type: 'DRUG_DRUG_INTERACTION',
              medicationA: meds[i].medicineName,
              medicationB: meds[j].medicineName,
              severity: rule.severity,
              description: rule.description,
              recommendation: rule.recommendation,
            });
          }
        }
      }
    }

    // 4. Return Severity Levels: SAFE, MODERATE, SEVERE
    const hasSevere = conflicts.some((c) => c.severity === 'SEVERE');
    const hasModerate = conflicts.some((c) => c.severity === 'MODERATE');

    let overallSeverity: 'SAFE' | 'MODERATE' | 'SEVERE' = 'SAFE';
    if (hasSevere) {
      overallSeverity = 'SEVERE';
    } else if (hasModerate) {
      overallSeverity = 'MODERATE';
    }

    const requiresOverride = hasSevere;
    const isBlocked = hasSevere;

    this.logger.log(
      `Drug safety verification result: ${conflicts.length} conflict(s). Severity: ${overallSeverity}, Blocked: ${isBlocked}`,
    );

    return {
      severity: overallSeverity,
      isBlocked,
      requiresOverride,
      conflicts,
    };
  }
}
