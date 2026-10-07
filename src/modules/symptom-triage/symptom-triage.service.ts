import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { TriageRequestDto } from './dto/triage-request.dto.js';

export const MANDATORY_MEDICAL_DISCLAIMER =
  'DISCLAIMER: This AI symptom triage assessment is for informational and preliminary routing purposes only. It does not constitute a formal medical diagnosis, clinical advice, or treatment plan. If you are experiencing severe chest pain, severe difficulty breathing, sudden weakness/numbness, heavy bleeding, or any life-threatening emergency, call emergency services (999/911) or proceed immediately to the nearest emergency department.';

export interface TriageAiAnalysis {
  urgency: 'EMERGENCY' | 'MODERATE' | 'NON_URGENT';
  urgencyLabel: string;
  clinicalAnalysis: string;
  matchingSpecialties: string[];
  recommendedAction: string;
  redFlags: string[];
}

@Injectable()
export class SymptomTriageService {
  private readonly logger = new Logger(SymptomTriageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main triage handler: Analyzes symptoms via AI or clinical rule engine,
   * classifies urgency, queries top 3 matching doctors, and appends mandatory medical disclaimer.
   */
  async triageSymptoms(dto: TriageRequestDto) {
    this.logger.log(
      `Performing symptom triage for symptoms: "${dto.symptoms}", duration: "${dto.duration}", severity: "${dto.severity}"`,
    );

    // 1. Perform AI analysis (with seamless fallback)
    const aiAnalysis = await this.analyzeSymptomsWithAi(dto);

    // 2. Fetch top 3 matching doctors based on matching medical specialties
    const matchingDoctors = await this.findTopMatchingDoctors(
      aiAnalysis.matchingSpecialties,
    );

    // 3. Return comprehensive triage response with required disclaimers
    return {
      urgency: aiAnalysis.urgency,
      urgencyLabel: aiAnalysis.urgencyLabel,
      clinicalAnalysis: aiAnalysis.clinicalAnalysis,
      matchingSpecialties: aiAnalysis.matchingSpecialties,
      recommendedAction: aiAnalysis.recommendedAction,
      redFlags: aiAnalysis.redFlags,
      matchingDoctorsCount: matchingDoctors.length,
      topMatchingDoctors: matchingDoctors,
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Integrates with OpenAI or Anthropic API, or falls back to rule-based clinical engine.
   */
  private async analyzeSymptomsWithAi(
    dto: TriageRequestDto,
  ): Promise<TriageAiAnalysis> {
    const openaiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      process.env.OPENAI_API_KEY;
    const anthropicKey =
      this.configService.get<string>('ANTHROPIC_API_KEY') ||
      process.env.ANTHROPIC_API_KEY;

    if (openaiKey) {
      try {
        return await this.callOpenAiApi(openaiKey, dto);
      } catch (err: any) {
        this.logger.warn(
          `OpenAI API call failed: ${err.message}. Using clinical rule fallback.`,
        );
      }
    } else if (anthropicKey) {
      try {
        return await this.callAnthropicApi(anthropicKey, dto);
      } catch (err: any) {
        this.logger.warn(
          `Anthropic API call failed: ${err.message}. Using clinical rule fallback.`,
        );
      }
    }

    return this.ruleBasedClinicalFallback(dto);
  }

  /**
   * Calls OpenAI Chat Completions API with structured JSON prompt.
   */
  private async callOpenAiApi(
    apiKey: string,
    dto: TriageRequestDto,
  ): Promise<TriageAiAnalysis> {
    const systemPrompt = `You are an expert AI Clinical Triage Assistant for the ShebaMitro Health Platform.
Analyze patient symptoms, duration, and severity to perform a preliminary triage evaluation.

CRITICAL RULES:
1. Classify urgency STRICTLY into one of: "EMERGENCY", "MODERATE", or "NON_URGENT".
2. Determine matching medical specialties (e.g. Cardiology, Pulmonology, Gastroenterology, Neurology, Orthopedics, General Medicine, Dermatology, Pediatrics, Psychiatry, ENT, Urology, Gynecology).
3. Return ONLY a valid JSON object strictly adhering to this schema:
{
  "urgency": "EMERGENCY" | "MODERATE" | "NON_URGENT",
  "urgencyLabel": "Human readable urgency status",
  "clinicalAnalysis": "Clinical summary of symptoms",
  "matchingSpecialties": ["Specialty1", "Specialty2"],
  "recommendedAction": "Actionable next steps",
  "redFlags": ["Red flag symptom 1", "Red flag symptom 2"]
}`;

    const userPrompt = `Patient Details:
- Symptoms: ${dto.symptoms}
- Duration: ${dto.duration}
- Severity: ${dto.severity}
${dto.age ? `- Age: ${dto.age}` : ''}
${dto.gender ? `- Gender: ${dto.gender}` : ''}
${dto.additionalNotes ? `- Clinical Notes: ${dto.additionalNotes}` : ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `HTTP error ${response.status}: ${await response.text()}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return this.validateAndNormalizeAiAnalysis(parsed);
  }

  /**
   * Calls Anthropic Messages API with structured JSON prompt.
   */
  private async callAnthropicApi(
    apiKey: string,
    dto: TriageRequestDto,
  ): Promise<TriageAiAnalysis> {
    const systemPrompt = `You are an expert AI Clinical Triage Assistant for ShebaMitro Health Platform.
Classify urgency strictly into "EMERGENCY", "MODERATE", or "NON_URGENT".
Identify matching medical specialties.
Respond ONLY with a JSON object format:
{"urgency": "EMERGENCY"|"MODERATE"|"NON_URGENT", "urgencyLabel": "...", "clinicalAnalysis": "...", "matchingSpecialties": ["..."], "recommendedAction": "...", "redFlags": ["..."]}`;

    const userPrompt = `Symptoms: ${dto.symptoms}, Duration: ${dto.duration}, Severity: ${dto.severity}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic HTTP error ${response.status}: ${await response.text()}`,
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in Anthropic output');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return this.validateAndNormalizeAiAnalysis(parsed);
  }

  /**
   * Rule-based clinical fallback engine for deterministic, reliable triage when API keys are absent or endpoints fail.
   */
  private ruleBasedClinicalFallback(dto: TriageRequestDto): TriageAiAnalysis {
    const symptomLower = dto.symptoms.toLowerCase();
    const severityLower = dto.severity.toLowerCase();

    const emergencyKeywords = [
      'chest pain',
      'shortness of breath',
      'difficulty breathing',
      'stroke',
      'paralysis',
      'numbness',
      'loss of consciousness',
      'fainted',
      'heavy bleeding',
      'crushing pain',
      'anaphylaxis',
      'sudden vision loss',
    ];

    const moderateKeywords = [
      'high fever',
      'persistent fever',
      'abdominal pain',
      'stomach pain',
      'vomiting',
      'diarrhea',
      'infection',
      'fracture',
      'sprain',
      'severe cough',
      'migraine',
      'dizziness',
    ];

    const isEmergency =
      severityLower.includes('severe') ||
      emergencyKeywords.some((kw) => symptomLower.includes(kw));

    const isModerate =
      !isEmergency &&
      (severityLower.includes('moderate') ||
        moderateKeywords.some((kw) => symptomLower.includes(kw)));

    if (isEmergency) {
      let specialties = [
        'Emergency Medicine',
        'Cardiology',
        'General Medicine',
      ];
      if (symptomLower.includes('chest') || symptomLower.includes('heart')) {
        specialties = ['Cardiology', 'General Medicine', 'Internal Medicine'];
      } else if (
        symptomLower.includes('stroke') ||
        symptomLower.includes('numbness')
      ) {
        specialties = ['Neurology', 'General Medicine'];
      } else if (
        symptomLower.includes('breath') ||
        symptomLower.includes('cough') ||
        symptomLower.includes('wheezing')
      ) {
        specialties = ['Pulmonology', 'General Medicine'];
      }

      return {
        urgency: 'EMERGENCY',
        urgencyLabel: 'Emergency - Immediate Medical Attention Required',
        clinicalAnalysis: `Reported acute symptoms (${dto.symptoms}) with high severity (${dto.severity}) indicate potential medical emergency requiring immediate evaluation.`,
        matchingSpecialties: specialties,
        recommendedAction:
          'Seek immediate emergency department evaluation or call emergency services (999/911). Do not drive yourself.',
        redFlags: [
          'Chest pressure or tightness',
          'Shortness of breath at rest',
          'Sudden weakness or difficulty speaking',
        ],
      };
    }

    if (isModerate) {
      let specialties = ['General Medicine'];
      if (
        symptomLower.includes('stomach') ||
        symptomLower.includes('abdominal')
      ) {
        specialties = ['Gastroenterology', 'General Medicine'];
      } else if (
        symptomLower.includes('bone') ||
        symptomLower.includes('joint')
      ) {
        specialties = ['Orthopedics', 'General Medicine'];
      } else if (
        symptomLower.includes('skin') ||
        symptomLower.includes('rash')
      ) {
        specialties = ['Dermatology', 'General Medicine'];
      }

      return {
        urgency: 'MODERATE',
        urgencyLabel:
          'Moderate - Prompt Consultation Recommended (Within 24-48h)',
        clinicalAnalysis: `Reported symptoms (${dto.symptoms}) lasting ${dto.duration} warrant clinical evaluation by a specialist within 24 to 48 hours.`,
        matchingSpecialties: specialties,
        recommendedAction:
          'Schedule a doctor appointment today or visit an urgent care center if symptoms escalate.',
        redFlags: [
          'Fever exceeding 102°F (38.9°C)',
          'Inability to keep fluids down',
          'Worsening localized severe pain',
        ],
      };
    }

    return {
      urgency: 'NON_URGENT',
      urgencyLabel: 'Non-Urgent - Routine Medical Advice',
      clinicalAnalysis: `Reported mild symptoms (${dto.symptoms}) can be evaluated via routine consultation.`,
      matchingSpecialties: ['General Medicine', 'Family Medicine'],
      recommendedAction:
        'Book an online video teleconsultation or chamber appointment at your convenience.',
      redFlags: ['Development of high fever or sudden onset severe pain'],
    };
  }

  /**
   * Helper to ensure AI output strictly adheres to contract.
   */
  private validateAndNormalizeAiAnalysis(parsed: any): TriageAiAnalysis {
    let urgency: 'EMERGENCY' | 'MODERATE' | 'NON_URGENT' = 'NON_URGENT';
    const rawUrgency = String(parsed.urgency || '').toUpperCase();

    if (rawUrgency.includes('EMERGENCY')) {
      urgency = 'EMERGENCY';
    } else if (rawUrgency.includes('MODERATE')) {
      urgency = 'MODERATE';
    }

    return {
      urgency,
      urgencyLabel: parsed.urgencyLabel || `${urgency} Evaluation Required`,
      clinicalAnalysis:
        parsed.clinicalAnalysis || 'Preliminary symptom analysis.',
      matchingSpecialties: Array.isArray(parsed.matchingSpecialties)
        ? parsed.matchingSpecialties
        : ['General Medicine'],
      recommendedAction:
        parsed.recommendedAction ||
        'Consult a licensed healthcare professional.',
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    };
  }

  /**
   * Executes Prisma query to find top 3 matching doctors based on matching medical specialties.
   */
  private async findTopMatchingDoctors(matchingSpecialties: string[]) {
    const specialtyConditions = matchingSpecialties.map((spec) => ({
      specialization: { contains: spec, mode: 'insensitive' as const },
    }));

    let doctors = await this.prisma.doctorProfile.findMany({
      where: {
        isApproved: true,
        deletedAt: null,
        OR: specialtyConditions.length > 0 ? specialtyConditions : undefined,
      },
      take: 3,
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Fallback: If no approved doctors match specific specialty, fetch top rated approved doctors
    if (doctors.length < 3) {
      const existingIds = doctors.map((d) => d.id);
      const fallbackDoctors = await this.prisma.doctorProfile.findMany({
        where: {
          isApproved: true,
          deletedAt: null,
          id: { notIn: existingIds },
        },
        take: 3 - doctors.length,
        orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      doctors = [...doctors, ...fallbackDoctors];
    }

    return doctors.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      name: doc.name || doc.user?.name || 'Dr. Medical Specialist',
      specialization: doc.specialization,
      qualifications: doc.qualifications,
      experienceYears: doc.experienceYears,
      consultFee: doc.consultFee,
      followUpFee: doc.followUpFee,
      rating: doc.rating,
      reviewCount: doc.reviewCount,
      hospital: doc.hospital || 'ShebaMitro Medical Network',
      bmdcRegNo: doc.bmdcRegNo,
      email: doc.user?.email,
      phone: doc.user?.phone,
    }));
  }
}
