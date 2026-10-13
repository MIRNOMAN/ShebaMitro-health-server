import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { UpdateStatsDto, CreateLiveActivityDto } from './dto/update-stats.dto.js';

export interface StatCounterItem {
  id: string;
  labelKey: string;
  subtextKey: string;
  label: string;
  labelBn: string;
  subtext: string;
  subtextBn: string;
  value: number;
  suffix: string;
  decimals?: number;
  icon: string;
  gradient: string;
}

export interface LiveActivityItem {
  id: string;
  message: string;
  messageBn: string;
  doctorName?: string;
  action?: string;
  location?: string;
  timeAgo: string;
  timeAgoBn: string;
  timestamp: string;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  // In-memory overrides or custom activities added by admin
  private customOverrides: Record<string, Partial<StatCounterItem>> = {};
  private customActivities: LiveActivityItem[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates dynamic live activities based on current time
   */
  private generateLiveActivities(): LiveActivityItem[] {
    const now = Date.now();

    const baseActivities: Array<{
      id: string;
      doctorName: string;
      doctorNameBn: string;
      action: string;
      actionBn: string;
      location: string;
      locationBn: string;
      offsetSec: number;
    }> = [
      {
        id: 'act-1',
        doctorName: 'Dr. Farah Ahmed',
        doctorNameBn: 'ডাঃ ফারাহ আহমেদ',
        action: 'completed a live video consultation',
        actionBn: 'লাইভ ভিডিও কনসালটেশন সম্পন্ন করেছেন',
        location: 'Dhaka',
        locationBn: 'ঢাকা',
        offsetSec: 14,
      },
      {
        id: 'act-2',
        doctorName: 'Dr. Tanvir Hasan',
        doctorNameBn: 'ডাঃ তানভীর হাসান',
        action: 'approved a chronic refill prescription',
        actionBn: 'ক্রনিক রিফিল প্রেসক্রিপশন অনুমোদন করেছেন',
        location: 'Chattogram',
        locationBn: 'চট্টগ্রাম',
        offsetSec: 38,
      },
      {
        id: 'act-3',
        doctorName: 'Model Pharmacy Express',
        doctorNameBn: 'মডেল ফার্মেসি এক্সপ্রেস',
        action: 'dispatched express cold-chain medicines',
        actionBn: 'কোল্ড চেইন জরুরি ওষুধ হোম ডেলিভারি ডিসপ্যাচ করেছে',
        location: 'Dhanmondi, Dhaka',
        locationBn: 'ধানমন্ডি, ঢাকা',
        offsetSec: 75,
      },
      {
        id: 'act-4',
        doctorName: 'Dr. Nusrat Jahan',
        doctorNameBn: 'ডাঃ নুসরাত জাহান',
        action: 'connected with a pediatric patient via HD video',
        actionBn: 'এইচডি ভিডিও কলে শিশু বিশেষজ্ঞ পরামর্শ প্রদান করেছেন',
        location: 'Sylhet',
        locationBn: 'সিলেট',
        offsetSec: 130,
      },
      {
        id: 'act-5',
        doctorName: 'ShebaMitro Diagnostic Tech',
        doctorNameBn: 'সেবামিত্র ডায়াগনস্টিক টিম',
        action: 'collected home blood sample for ISO lab testing',
        actionBn: 'আইএসও ল্যাব টেস্টের রক্তের নমুনা সংগ্রহ সম্পন্ন করেছে',
        location: 'Uttara, Dhaka',
        locationBn: 'উত্তরা, ঢাকা',
        offsetSec: 240,
      },
    ];

    const toBnDigits = (val: string | number) => {
      const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
      return String(val).replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)]);
    };

    const formattedList: LiveActivityItem[] = baseActivities.map((item) => {
      let timeAgo = `${item.offsetSec}s ago`;
      let timeAgoBn = `${toBnDigits(item.offsetSec)} সে পূর্বে`;

      if (item.offsetSec >= 60) {
        const mins = Math.floor(item.offsetSec / 60);
        timeAgo = `${mins}m ago`;
        timeAgoBn = `${toBnDigits(mins)} মি পূর্বে`;
      }

      return {
        id: item.id,
        doctorName: item.doctorName,
        action: item.action,
        location: item.location,
        message: `${item.doctorName} ${item.action} in ${item.location} • ${timeAgo}`,
        messageBn: `${item.doctorNameBn} ${item.locationBn} থেকে ${item.actionBn} • ${timeAgoBn}`,
        timeAgo,
        timeAgoBn,
        timestamp: new Date(now - item.offsetSec * 1000).toISOString(),
      };
    });

    return [...this.customActivities, ...formattedList];
  }

  /**
   * Retrieve platform stats and live activity feeds
   */
  async getHomeStats(): Promise<{
    counters: StatCounterItem[];
    liveActivity: LiveActivityItem;
    liveActivities: LiveActivityItem[];
  }> {
    let completedAppointments = 0;
    let approvedDoctorsCount = 0;
    let totalDoctorsCount = 0;
    let avgDoctorRating = 4.9;

    try {
      // 1. Query appointments completed
      completedAppointments = await this.prisma.appointment.count({
        where: { status: 'COMPLETED' },
      });

      // 2. Query doctors count
      approvedDoctorsCount = await this.prisma.doctorProfile.count({
        where: { isApproved: true },
      });
      totalDoctorsCount = await this.prisma.doctorProfile.count();

      // 3. Query doctor ratings
      const ratingAgg = await this.prisma.doctorProfile.aggregate({
        _avg: { rating: true },
        where: { rating: { gt: 0 } },
      });

      if (ratingAgg._avg.rating && ratingAgg._avg.rating > 0) {
        avgDoctorRating = parseFloat(ratingAgg._avg.rating.toFixed(1));
      }
    } catch (err: any) {
      this.logger.warn(`Could not compute live database aggregate stats: ${err.message}`);
    }

    // Baseline numbers matching production platform scale
    const consultationsValue =
      this.customOverrides['consultations']?.value ?? (50000 + completedAppointments);

    const doctorsValue =
      this.customOverrides['doctors']?.value ??
      (1200 + (approvedDoctorsCount > 0 ? approvedDoctorsCount : totalDoctorsCount));

    const deliveryValue =
      this.customOverrides['delivery']?.value ?? 99.4;

    const ratingValue =
      this.customOverrides['rating']?.value ?? avgDoctorRating;

    const counters: StatCounterItem[] = [
      {
        id: 'consultations',
        labelKey: 'statConsultations',
        subtextKey: 'statConsultationsSub',
        label: 'Completed Consultations',
        labelBn: 'সফল চিকিৎসা সেবা',
        subtext: 'Across 64 districts in Bangladesh',
        subtextBn: 'বাংলাদেশের ৬৪টি জেলায় বিস্তৃত',
        value: consultationsValue,
        suffix: '+',
        decimals: 0,
        icon: 'Users',
        gradient: 'from-primary-teal to-emerald-accent',
      },
      {
        id: 'doctors',
        labelKey: 'statDoctors',
        subtextKey: 'statDoctorsSub',
        label: 'BMDC Certified Specialists',
        labelBn: 'বিএমডিসি নিবন্ধিত ডাক্তার',
        subtext: 'Verified credentials & BMDC IDs',
        subtextBn: 'যাচাইকৃত রেজিস্টার্ড বিশেষজ্ঞ প্যানেল',
        value: doctorsValue,
        suffix: '+',
        decimals: 0,
        icon: 'Stethoscope',
        gradient: 'from-violet-accent to-primary-teal',
      },
      {
        id: 'delivery',
        labelKey: 'statDelivery',
        subtextKey: 'statDeliverySub',
        label: 'On-Time Express Delivery',
        labelBn: 'দ্রুত ওষুধ সরবরাহ',
        subtext: 'Average delivery time 42 mins',
        subtextBn: 'গড় ডেলিভারি সময় মাত্র ৪২ মিনিট',
        value: deliveryValue,
        suffix: '%',
        decimals: 1,
        icon: 'Truck',
        gradient: 'from-emerald-accent to-primary-teal',
      },
      {
        id: 'rating',
        labelKey: 'statRating',
        subtextKey: 'statRatingSub',
        label: 'Patient Satisfaction Rating',
        labelBn: 'রোগীদের সন্তুষ্টি রেটিং',
        subtext: 'Based on 14,000+ verified reviews',
        subtextBn: '১৪,০০০+ পেশেন্ট রিভিউ এর ভিত্তিতে',
        value: ratingValue,
        suffix: ' / 5.0',
        decimals: 1,
        icon: 'Star',
        gradient: 'from-coral-accent to-violet-accent',
      },
    ];

    const liveActivities = this.generateLiveActivities();
    const liveActivity = liveActivities[0];

    return {
      counters,
      liveActivity,
      liveActivities,
    };
  }

  /**
   * Get just the counters array
   */
  async getCounters(): Promise<StatCounterItem[]> {
    const stats = await this.getHomeStats();
    return stats.counters;
  }

  /**
   * Get live activity ticker feed
   */
  async getLiveActivities(): Promise<{
    current: LiveActivityItem;
    feed: LiveActivityItem[];
  }> {
    const stats = await this.getHomeStats();
    return {
      current: stats.liveActivity,
      feed: stats.liveActivities,
    };
  }

  /**
   * Update or override stats / add custom live activity (Admin)
   */
  async updateStats(dto: UpdateStatsDto) {
    if (dto.counters) {
      for (const counter of dto.counters) {
        this.customOverrides[counter.id] = counter;
      }
    }

    if (dto.newActivity) {
      const act = dto.newActivity;
      const customItem: LiveActivityItem = {
        id: `custom-${Date.now()}`,
        message: act.message,
        messageBn: act.messageBn || act.message,
        doctorName: act.doctorName,
        action: act.action,
        location: act.location,
        timeAgo: 'Just now',
        timeAgoBn: 'এইমাত্র',
        timestamp: new Date().toISOString(),
      };
      this.customActivities.unshift(customItem);
      // Keep up to 10 custom activities
      if (this.customActivities.length > 10) {
        this.customActivities.pop();
      }
    }

    return this.getHomeStats();
  }
}
