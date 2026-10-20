import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Medicine } from '@prisma/client';

export interface MediDataApiMedicine {
  id: number;
  name: string;
  generic: string;
  company: string;
  link?: string;
  indications?: string;
  therapeutic_class?: string;
  pharmacology?: string;
  dosage?: string;
  side_effects?: string;
  pregnancy_category?: string;
  precautions?: string;
  storage_conditions?: string;
}

@Injectable()
export class MedidataService {
  private readonly logger = new Logger(MedidataService.name);
  private readonly baseUrl = 'https://medicine-api-rifat.vercel.app';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches a medicine by ID directly from MediData API (https://medicine-api-rifat.vercel.app/api/medicines/:id)
   * and maps it to our unified Medicine schema.
   */
  async fetchFromMediData(id: number | string): Promise<Medicine | null> {
    try {
      this.logger.log(`Fetching medicine #${id} from MediData API...`);
      const res = await fetch(`${this.baseUrl}/api/medicines/${id}`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        this.logger.warn(
          `MediData API returned ${res.status} for medicine #${id}`,
        );
        return null;
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        return null;
      }

      const raw: MediDataApiMedicine = json.data;
      return this.upsertFromMediData(raw);
    } catch (err: any) {
      this.logger.error(`Error querying MediData API: ${err.message}`);
      return null;
    }
  }

  /**
   * Upserts a MediData raw object into our PostgreSQL database so it is cached and searchable.
   */
  async upsertFromMediData(raw: MediDataApiMedicine): Promise<Medicine> {
    const category = this.mapTherapeuticClassToCategory(
      raw.therapeutic_class || '',
      raw.indications || '',
    );
    const price = this.estimateRealisticPrice(
      raw.name,
      raw.therapeutic_class || '',
    );
    const packSize =
      raw.name.toLowerCase().includes('syrup') ||
      raw.name.toLowerCase().includes('suspension')
        ? '1 Bottle (100ml)'
        : '10 Tablets / Strip';
    const type = raw.name.toLowerCase().includes('syrup')
      ? 'Syrup'
      : raw.name.toLowerCase().includes('cap')
        ? 'Capsule'
        : 'Tablet';

    // Check if already in DB by name
    const existing = await this.prisma.medicine.findFirst({
      where: {
        OR: [
          { name: { equals: raw.name, mode: 'insensitive' } },
          { id: `medidata-${raw.id}` },
        ],
      },
    });

    if (existing) {
      return this.prisma.medicine.update({
        where: { id: existing.id },
        data: {
          genericName: raw.generic || existing.genericName,
          manufacturer: raw.company || existing.manufacturer,
          description: raw.indications || existing.description,
          dosageGuidance: raw.dosage || existing.dosageGuidance,
        },
      });
    }

    return this.prisma.medicine.create({
      data: {
        id: `medidata-${raw.id}`,
        name: raw.name,
        genericName: raw.generic || 'Essential Formulation',
        manufacturer: raw.company || 'Licensed Manufacturer',
        type,
        strength: this.extractStrength(raw.name),
        packSize,
        price,
        originalPrice: Math.round(price * 1.15),
        category,
        requiresPrescription: !['pain', 'vitamins', 'digestive'].includes(
          category,
        ),
        inStock: true,
        stockQuantity: 150,
        imageUrl:
          'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop',
        description: raw.indications || 'DGDA Registered Medicine',
        dosageGuidance:
          raw.dosage || 'Take as advised by a registered medical practitioner.',
      },
    });
  }

  /**
   * Syncs a list of known top MediData IDs into the database
   */
  async syncPopularMediDataMedicines(): Promise<{
    synced: number;
    items: string[];
  }> {
    const targetIds = [
      14742, 1, 2, 5, 10, 50, 500, 1000, 2000, 5000, 10000, 12000, 20000,
    ];
    const syncedNames: string[] = [];

    for (const id of targetIds) {
      try {
        const item = await this.fetchFromMediData(id);
        if (item) {
          syncedNames.push(item.name);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to sync ID ${id}: ${e.message}`);
      }
    }

    return {
      synced: syncedNames.length,
      items: syncedNames,
    };
  }

  private mapTherapeuticClassToCategory(
    therapeutic: string,
    indications: string,
  ): string {
    const text = (therapeutic + ' ' + indications).toLowerCase();
    if (
      text.includes('analgesic') ||
      text.includes('paracetamol') ||
      text.includes('fever') ||
      text.includes('pain')
    )
      return 'pain';
    if (
      text.includes('proton') ||
      text.includes('ulcer') ||
      text.includes('gastric') ||
      text.includes('gerd')
    )
      return 'digestive';
    if (
      text.includes('antibacterial') ||
      text.includes('antibiotic') ||
      text.includes('cefixime') ||
      text.includes('levofloxacin')
    )
      return 'antibiotic';
    if (
      text.includes('vitamin') ||
      text.includes('mineral') ||
      text.includes('calcium') ||
      text.includes('cholecalciferol')
    )
      return 'vitamins';
    if (
      text.includes('diabet') ||
      text.includes('metformin') ||
      text.includes('vildagliptin')
    )
      return 'diabetic';
    if (
      text.includes('hypertension') ||
      text.includes('blood pressure') ||
      text.includes('amlodipine') ||
      text.includes('cardiac')
    )
      return 'cardiac';
    return 'pain';
  }

  private extractStrength(name: string): string {
    const match = name.match(/(\d+(\.\d+)?\s*(mg|ml|mcg|gm|iu|%))/i);
    return match ? match[0] : 'Standard';
  }

  private estimateRealisticPrice(name: string, therapeutic: string): number {
    const lower = name.toLowerCase();
    if (lower.includes('napa')) return 35;
    if (lower.includes('bion') || lower.includes('vitamin')) return 120;
    if (lower.includes('3-c') || lower.includes('cefixime')) return 350;
    if (lower.includes('3-f') || lower.includes('levofloxacin')) return 180;
    if (lower.includes('salbutamol')) return 40;
    if (lower.includes('clovir')) return 220;
    if (lower.includes('galet')) return 280;
    return 75;
  }
}
