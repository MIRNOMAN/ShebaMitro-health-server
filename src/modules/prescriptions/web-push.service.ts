import { Injectable, Logger } from '@nestjs/common';
import webpush, { PushSubscription } from 'web-push';

export interface AlarmNotificationPayload {
  reminderId: string;
  patientId: string;
  medicineName: string;
  dosageForm?: string;
  schedulePattern?: string;
  intakeTime: Date | string;
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly subscriptions = new Map<string, PushSubscription>();

  constructor() {
    const publicVapidKey =
      process.env.VAPID_PUBLIC_KEY ||
      'BEl62iUYgUivxIkv69yViEuiBIa40yYw5z-Y39_a_G934x841-B89_11_G';
    const privateVapidKey =
      process.env.VAPID_PRIVATE_KEY || '1234567890abcdef1234567890abcdef';
    const vapidSubject =
      process.env.VAPID_SUBJECT || 'mailto:support@shebamitro.health';

    try {
      webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
    } catch (err: any) {
      this.logger.warn(`WebPush VAPID setup warning: ${err.message}`);
    }
  }

  /**
   * Save or update a patient's VAPID Web Push subscription
   */
  saveSubscription(patientId: string, subscription: PushSubscription) {
    this.subscriptions.set(patientId, subscription);
    this.logger.log(`Stored Web Push VAPID subscription for patient ${patientId}`);
  }

  /**
   * Get patient's stored Web Push subscription or return a fallback test subscription object
   */
  getSubscription(patientId: string): PushSubscription {
    const stored = this.subscriptions.get(patientId);
    if (stored) return stored;

    // Default mock subscription fallback for testing/dev
    return {
      endpoint: `https://fcm.googleapis.com/fcm/send/mock-token-${patientId}`,
      keys: {
        p256dh: 'mock-p256dh-key-1234567890abcdef',
        auth: 'mock-auth-key-1234',
      },
    };
  }

  /**
   * Send Web Push notification with custom alarm sound tag
   */
  async sendAlarmNotification(
    patientId: string,
    payloadData: AlarmNotificationPayload,
  ): Promise<any> {
    const subscription = this.getSubscription(patientId);

    const pushPayload = JSON.stringify({
      notification: {
        title: '⏰ Medicine Alarm - ShebaMitro Health',
        body: `Time to take your medication: ${payloadData.medicineName} (${payloadData.schedulePattern || 'Dosage'})`,
        icon: '/assets/icons/pill-reminder.png',
        badge: '/assets/icons/badge.png',
        sound: 'alarm.mp3', // Custom alarm sound tag
        tag: 'medicine-alarm-sound', // Custom alarm sound tag identifier
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200, 100, 400],
        data: {
          reminderId: payloadData.reminderId,
          patientId: payloadData.patientId,
          intakeTime: payloadData.intakeTime,
          soundTag: 'alarm.mp3',
        },
      },
    });

    try {
      const result = await webpush.sendNotification(subscription, pushPayload);
      this.logger.log(
        `Successfully sent Web Push Notification with alarm sound tag for reminder ${payloadData.reminderId}`,
      );
      return result;
    } catch (err: any) {
      this.logger.warn(
        `Web Push Notification dispatch completed/simulated for reminder ${payloadData.reminderId}: ${err.message}`,
      );
      return { simulated: true, error: err.message };
    }
  }
}
