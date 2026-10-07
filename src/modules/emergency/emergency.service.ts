import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { EmergencyGateway } from './emergency.gateway.js';
import type { SmsAdapter } from '../otp/adapters/sms-adapter.interface.js';
import { CreateSosDto } from './dto/create-sos.dto.js';
import { Role } from '@prisma/client';

export interface GeoSearchResult {
  id: string;
  distanceKm: number;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class EmergencyService implements OnModuleInit {
  private readonly logger = new Logger(EmergencyService.name);
  private readonly AMBULANCE_GEO_KEY = 'emergency:geo:ambulances';
  private readonly HOSPITAL_GEO_KEY = 'emergency:geo:hospitals';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly emergencyGateway: EmergencyGateway,
    @Inject('SMS_ADAPTER') private readonly smsAdapter: SmsAdapter,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureInitialSeedData();
      await this.syncDatabaseLocationsToRedis();
    } catch (err: any) {
      this.logger.warn(
        `EmergencyService initialization sync deferred: ${err.message}`,
      );
    }
  }

  /**
   * Primary SOS Handler:
   * 1. Finds verified ambulances and hospitals within 10km radius using Redis GEOSEARCH / GEODIST
   * 2. Generates temporary live GPS tracking token (valid for 2h)
   * 3. Sends immediate SMS alert with tracking link to patient emergency contact
   * 4. Dispatches real-time notification to nearest ambulance driver app via WebSockets
   */
  async triggerSos(
    callerUserId?: string,
    callerRole?: string,
    dto?: CreateSosDto,
  ) {
    if (!dto) {
      throw new BadRequestException(
        'Latitude and longitude coordinates are required',
      );
    }

    const {
      latitude,
      longitude,
      notes,
      emergencyContact: customEmergencyContact,
    } = dto;

    // 1. Resolve Patient Profile & Emergency Contact
    let patientProfileId: string | null = null;
    let patientName: string | null = null;
    let patientPhone: string | null = null;
    let emergencyContactPhone: string | null = customEmergencyContact || null;

    if (dto.patientId) {
      const profile = await this.prisma.patientProfile.findFirst({
        where: {
          OR: [{ id: dto.patientId }, { userId: dto.patientId }],
        },
        include: { user: { select: { name: true, phone: true } } },
      });
      if (profile) {
        patientProfileId = profile.id;
        patientName = profile.user?.name || null;
        patientPhone = profile.user?.phone || null;
        if (!emergencyContactPhone) {
          emergencyContactPhone = profile.emergencyContact || patientPhone;
        }
      }
    } else if (callerUserId && callerRole === Role.PATIENT) {
      const profile = await this.prisma.patientProfile.findUnique({
        where: { userId: callerUserId },
        include: { user: { select: { name: true, phone: true } } },
      });
      if (profile) {
        patientProfileId = profile.id;
        patientName = profile.user?.name || null;
        patientPhone = profile.user?.phone || null;
        if (!emergencyContactPhone) {
          emergencyContactPhone = profile.emergencyContact || patientPhone;
        }
      }
    }

    // 2. Perform Redis Geospatial Search (10km Radius)
    const radiusKm = 10;
    const nearbyAmbulances = await this.searchNearbyGeospatial(
      this.AMBULANCE_GEO_KEY,
      latitude,
      longitude,
      radiusKm,
      'AMBULANCE',
    );

    const nearbyHospitals = await this.searchNearbyGeospatial(
      this.HOSPITAL_GEO_KEY,
      latitude,
      longitude,
      radiusKm,
      'HOSPITAL',
    );

    // 3. Resolve Nearest Dispatched Ambulance & Hospital
    const nearestAmbulanceGeo = nearbyAmbulances[0] || null;
    const nearestHospitalGeo = nearbyHospitals[0] || null;

    let dispatchedAmbulance: any = null;
    if (nearestAmbulanceGeo) {
      dispatchedAmbulance = await this.prisma.ambulance.findUnique({
        where: { id: nearestAmbulanceGeo.id },
      });
    }

    let nearestHospital: any = null;
    if (nearestHospitalGeo) {
      nearestHospital = await this.prisma.hospital.findUnique({
        where: { id: nearestHospitalGeo.id },
      });
    }

    // 4. Generate Temporary Live GPS Tracking Link (valid for 2 hours)
    const trackingToken = `sos_tr_${randomUUID().replace(/-/g, '')}`;
    const trackingExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 Hours TTL
    const trackingUrl = `https://shebamitro.health/track/sos/${trackingToken}`;

    // 5. Register EmergencyRequest in DB
    const emergencyRequest = await this.prisma.emergencyRequest.create({
      data: {
        patientId: patientProfileId,
        latitude,
        longitude,
        status: 'DISPATCHED',
        trackingToken,
        trackingExpiresAt,
        dispatchedAmbulanceId: dispatchedAmbulance?.id || null,
        nearestHospitalId: nearestHospital?.id || null,
        notes: notes || null,
      },
      include: {
        dispatchedAmbulance: true,
        nearestHospital: true,
      },
    });

    // 6. Trigger Immediate SMS Alert to Patient Emergency Contacts
    let smsSent = false;
    const targetSmsNumber =
      emergencyContactPhone || patientPhone || '+8801700000000';
    const smsMessage = `🚨 SHEBAMITRO EMERGENCY SOS ALERT! Patient ${patientName || 'Emergency User'} requires urgent assistance. Live GPS Tracking (valid 2h): ${trackingUrl}. Assigned Hospital: ${nearestHospital?.name || 'Nearest ER Facility'}.`;

    try {
      smsSent = await this.smsAdapter.sendSms(targetSmsNumber, smsMessage);
      this.logger.log(
        `[SMS DISPATCH] Emergency SMS sent to ${targetSmsNumber}: ${smsSent}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send emergency SMS alert: ${err.message}`);
    }

    // 7. Dispatch Real-time Notification to Nearest Ambulance Driver App via WebSockets
    const dispatchPayload = {
      sosId: emergencyRequest.id,
      trackingToken,
      patientId: patientProfileId,
      patientName: patientName || 'Emergency Patient',
      patientPhone: patientPhone || emergencyContactPhone || null,
      latitude,
      longitude,
      distanceKm: nearestAmbulanceGeo?.distanceKm || 0,
      nearestHospital: nearestHospital
        ? {
            id: nearestHospital.id,
            name: nearestHospital.name,
            address: nearestHospital.address,
            distanceKm: nearestHospitalGeo?.distanceKm || 0,
          }
        : null,
      ambulance: dispatchedAmbulance
        ? {
            id: dispatchedAmbulance.id,
            driverName: dispatchedAmbulance.driverName,
            vehicleNumber: dispatchedAmbulance.vehicleNumber,
          }
        : null,
      createdAt: emergencyRequest.createdAt,
    };

    this.emergencyGateway.emitAmbulanceDispatch(dispatchPayload);

    return {
      success: true,
      message: 'Emergency SOS dispatched successfully',
      sosId: emergencyRequest.id,
      trackingToken,
      trackingUrl,
      trackingExpiresAt,
      smsSent,
      dispatchedAmbulance: dispatchedAmbulance
        ? {
            id: dispatchedAmbulance.id,
            driverName: dispatchedAmbulance.driverName,
            driverPhone: dispatchedAmbulance.driverPhone,
            vehicleNumber: dispatchedAmbulance.vehicleNumber,
            distanceKm: nearestAmbulanceGeo?.distanceKm || 0,
          }
        : null,
      nearestHospital: nearestHospital
        ? {
            id: nearestHospital.id,
            name: nearestHospital.name,
            address: nearestHospital.address,
            phone: nearestHospital.phone,
            distanceKm: nearestHospitalGeo?.distanceKm || 0,
          }
        : null,
      nearbyAmbulancesCount: nearbyAmbulances.length,
      nearbyHospitalsCount: nearbyHospitals.length,
      nearbyAmbulances,
      nearbyHospitals,
    };
  }

  /**
   * Perform Geospatial Search using Redis GEOSEARCH / GEODIST commands,
   * with graceful in-memory Haversine distance fallback if Redis raw client is unavailable.
   */
  private async searchNearbyGeospatial(
    geoKey: string,
    latitude: number,
    longitude: number,
    radiusKm: number,
    type: 'AMBULANCE' | 'HOSPITAL',
  ): Promise<GeoSearchResult[]> {
    const redis = this.redisService.getRawClient();

    if (redis) {
      try {
        // Execute Redis GEOSEARCH command:
        // GEOSEARCH key FROMLONLAT <lon> <lat> BYRADIUS <radius> km WITHDIST WITHCOORD ASC
        const rawResults = (await redis.call(
          'GEOSEARCH',
          geoKey,
          'FROMLONLAT',
          longitude,
          latitude,
          'BYRADIUS',
          radiusKm,
          'km',
          'WITHDIST',
          'WITHCOORD',
          'ASC',
        )) as any[];

        if (Array.isArray(rawResults) && rawResults.length > 0) {
          const results: GeoSearchResult[] = rawResults.map((item) => {
            // item format: [memberId, distanceStr, [lonStr, latStr]]
            const id = Array.isArray(item) ? item[0] : item;
            const dist =
              Array.isArray(item) && item[1] ? parseFloat(item[1]) : 0;
            const coords = Array.isArray(item) && item[2] ? item[2] : null;

            return {
              id: String(id),
              distanceKm: parseFloat(dist.toFixed(2)),
              longitude: coords ? parseFloat(coords[0]) : undefined,
              latitude: coords ? parseFloat(coords[1]) : undefined,
            };
          });

          return results;
        }
      } catch (err: any) {
        this.logger.warn(
          `Redis GEOSEARCH failed for ${geoKey}: ${err.message}. Falling back to database geospatial calculation.`,
        );
      }
    }

    // Fallback: Haversine distance over database records
    return this.fallbackHaversineSearch(latitude, longitude, radiusKm, type);
  }

  /**
   * Fallback Geospatial calculation using Haversine formula for offline / mock testing
   */
  private async fallbackHaversineSearch(
    lat: number,
    lon: number,
    radiusKm: number,
    type: 'AMBULANCE' | 'HOSPITAL',
  ): Promise<GeoSearchResult[]> {
    if (type === 'AMBULANCE') {
      const ambulances = await this.prisma.ambulance.findMany({
        where: { isVerified: true, isAvailable: true },
      });

      const matched = ambulances
        .map((amb) => {
          const dist = this.calculateHaversineDistanceKm(
            lat,
            lon,
            amb.latitude,
            amb.longitude,
          );
          return {
            id: amb.id,
            distanceKm: parseFloat(dist.toFixed(2)),
            latitude: amb.latitude,
            longitude: amb.longitude,
          };
        })
        .filter((item) => item.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      return matched;
    } else {
      const hospitals = await this.prisma.hospital.findMany({
        where: { isVerified: true },
      });

      const matched = hospitals
        .map((hosp) => {
          const dist = this.calculateHaversineDistanceKm(
            lat,
            lon,
            hosp.latitude,
            hosp.longitude,
          );
          return {
            id: hosp.id,
            distanceKm: parseFloat(dist.toFixed(2)),
            latitude: hosp.latitude,
            longitude: hosp.longitude,
          };
        })
        .filter((item) => item.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      return matched;
    }
  }

  /**
   * Haversine formula calculation for distance between two lat/lon coordinates in kilometers
   */
  private calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in KM
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Sync all database ambulances and hospitals to Redis GEO index
   */
  async syncDatabaseLocationsToRedis() {
    const redis = this.redisService.getRawClient();
    if (!redis) return;

    try {
      const ambulances = await this.prisma.ambulance.findMany({
        where: { isVerified: true },
      });
      for (const amb of ambulances) {
        // GEOADD key longitude latitude member
        await redis.call(
          'GEOADD',
          this.AMBULANCE_GEO_KEY,
          amb.longitude,
          amb.latitude,
          amb.id,
        );
      }

      const hospitals = await this.prisma.hospital.findMany({
        where: { isVerified: true },
      });
      for (const hosp of hospitals) {
        await redis.call(
          'GEOADD',
          this.HOSPITAL_GEO_KEY,
          hosp.longitude,
          hosp.latitude,
          hosp.id,
        );
      }

      this.logger.log(
        `Synced ${ambulances.length} ambulances & ${hospitals.length} hospitals to Redis geospatial indexes.`,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to sync locations to Redis GEO: ${err.message}`);
    }
  }

  /**
   * Retrieve active live GPS tracking status for a temporary token
   */
  async getTrackingStatus(token: string) {
    const sos = await this.prisma.emergencyRequest.findUnique({
      where: { trackingToken: token },
      include: {
        dispatchedAmbulance: true,
        nearestHospital: true,
        patient: { include: { user: { select: { name: true, phone: true } } } },
      },
    });

    if (!sos) {
      throw new NotFoundException(
        'Emergency tracking session not found or expired',
      );
    }

    const isExpired = new Date() > new Date(sos.trackingExpiresAt);

    return {
      sosId: sos.id,
      trackingToken: sos.trackingToken,
      status: sos.status,
      isExpired,
      trackingExpiresAt: sos.trackingExpiresAt,
      patientLocation: {
        latitude: sos.latitude,
        longitude: sos.longitude,
      },
      dispatchedAmbulance: sos.dispatchedAmbulance
        ? {
            id: sos.dispatchedAmbulance.id,
            driverName: sos.dispatchedAmbulance.driverName,
            driverPhone: sos.dispatchedAmbulance.driverPhone,
            vehicleNumber: sos.dispatchedAmbulance.vehicleNumber,
            currentLocation: {
              latitude: sos.dispatchedAmbulance.latitude,
              longitude: sos.dispatchedAmbulance.longitude,
            },
          }
        : null,
      nearestHospital: sos.nearestHospital
        ? {
            id: sos.nearestHospital.id,
            name: sos.nearestHospital.name,
            address: sos.nearestHospital.address,
            phone: sos.nearestHospital.phone,
            location: {
              latitude: sos.nearestHospital.latitude,
              longitude: sos.nearestHospital.longitude,
            },
          }
        : null,
      createdAt: sos.createdAt,
    };
  }

  /**
   * Update ambulance coordinates (syncs DB + Redis GEO)
   */
  async updateAmbulanceLocation(
    ambulanceId: string,
    latitude: number,
    longitude: number,
  ) {
    const updated = await this.prisma.ambulance.update({
      where: { id: ambulanceId },
      data: { latitude, longitude },
    });

    const redis = this.redisService.getRawClient();
    if (redis) {
      try {
        await redis.call(
          'GEOADD',
          this.AMBULANCE_GEO_KEY,
          longitude,
          latitude,
          ambulanceId,
        );
      } catch (err: any) {
        this.logger.warn(`Redis GEOADD update failed: ${err.message}`);
      }
    }

    return updated;
  }

  /**
   * Seed default verified ambulances and hospitals in Dhaka if database is empty
   */
  private async ensureInitialSeedData() {
    const countHospitals = await this.prisma.hospital.count();
    if (countHospitals === 0) {
      await this.prisma.hospital.createMany({
        data: [
          {
            name: 'Dhaka Medical College & Hospital (DMCH)',
            address: 'Secretariat Road, Dhaka 1000',
            phone: '+880255165088',
            latitude: 23.7258,
            longitude: 90.3976,
            isVerified: true,
          },
          {
            name: 'Square Hospital',
            address: '18/F Bir Uttam Qazi Nuruzzaman Sarak, Dhaka 1205',
            phone: '+88028159457',
            latitude: 23.7531,
            longitude: 90.3817,
            isVerified: true,
          },
          {
            name: 'Labaid Specialized Hospital',
            address: 'House 6, Road 4, Dhanmondi, Dhaka 1205',
            phone: '+88029676356',
            latitude: 23.7415,
            longitude: 90.3822,
            isVerified: true,
          },
          {
            name: 'United Hospital Limited',
            address: 'Plot 15, Road 71, Gulshan 2, Dhaka 1212',
            phone: '+88028836444',
            latitude: 23.7978,
            longitude: 90.4147,
            isVerified: true,
          },
          {
            name: 'Evercare Hospital Dhaka',
            address: 'Plot 81, Block E, Bashundhara R/A, Dhaka 1229',
            phone: '+88028431661',
            latitude: 23.8116,
            longitude: 90.4312,
            isVerified: true,
          },
        ],
      });
    }

    const countAmbulances = await this.prisma.ambulance.count();
    if (countAmbulances === 0) {
      await this.prisma.ambulance.createMany({
        data: [
          {
            driverName: 'Rafiqul Islam',
            driverPhone: '+8801711002233',
            vehicleNumber: 'DHAKA-METRO-CH-11-2026',
            latitude: 23.812,
            longitude: 90.415,
            hospitalName: 'Evercare Hospital Dhaka',
            isVerified: true,
            isAvailable: true,
          },
          {
            driverName: 'Kamal Hossain',
            driverPhone: '+8801811998877',
            vehicleNumber: 'DHAKA-METRO-CH-12-4050',
            latitude: 23.754,
            longitude: 90.382,
            hospitalName: 'Square Hospital',
            isVerified: true,
            isAvailable: true,
          },
          {
            driverName: 'Alamgir Hossain',
            driverPhone: '+8801911445566',
            vehicleNumber: 'DHAKA-METRO-CH-14-9988',
            latitude: 23.742,
            longitude: 90.383,
            hospitalName: 'Labaid Specialized Hospital',
            isVerified: true,
            isAvailable: true,
          },
        ],
      });
    }
  }
}
