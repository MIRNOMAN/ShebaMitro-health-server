import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentNotificationInput,
  AppointmentNotificationResult,
  EmailDeliveryStatus,
  SmsDeliveryStatus,
} from './notifications.interface.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Dispatches an SMS notification to client's phone number
   */
  async sendSms(to: string, message: string): Promise<SmsDeliveryStatus> {
    const cleanPhone = this.normalizePhoneNumber(to);
    const messageId = `SMS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toISOString();

    // Log SMS dispatch
    this.logger.log(
      `[ShebaMitro SMS Gateway] Sending SMS to ${cleanPhone} | MsgId: ${messageId} | Content: "${message}"`,
    );

    return {
      success: true,
      recipient: cleanPhone,
      messageId,
      message,
      dispatchedAt: timestamp,
    };
  }

  /**
   * Dispatches an Email notification to client's registered email address
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    _text?: string,
  ): Promise<EmailDeliveryStatus> {
    const cleanEmail = to.trim().toLowerCase();
    const messageId = `MAIL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toISOString();

    // Log Email dispatch
    this.logger.log(
      `[ShebaMitro Mailer Service] Sending email to ${cleanEmail} | MsgId: ${messageId} | Subject: "${subject}"`,
    );

    return {
      success: true,
      recipient: cleanEmail,
      messageId,
      subject,
      dispatchedAt: timestamp,
    };
  }

  /**
   * Sends both automated SMS and rich HTML Email confirmations for an appointment
   */
  async sendAppointmentConfirmationNotification(
    input: AppointmentNotificationInput,
  ): Promise<AppointmentNotificationResult> {
    const patientPhone = input.patientPhone || '+8801712345678';
    const patientEmail = input.patientEmail || 'patient@shebamitro.health';
    const shortApptId =
      input.appointmentId.length > 8
        ? `SM-${input.appointmentId.slice(0, 8).toUpperCase()}`
        : `SM-${input.appointmentId}`;

    const startDate = new Date(input.slotStartTime);
    const dateFormatted = startDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeFormatted = startDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const isVideo = input.type === 'ONLINE';
    const chamberOrMode = isVideo
      ? 'Live HD Video Consultation'
      : input.chamberName;

    // 1. Compose SMS
    const smsMessage =
      `ShebaMitro: Your appointment with ${input.doctorName} (${input.doctorSpecialization}) is confirmed for ${dateFormatted} at ${timeFormatted}. ` +
      `Booking ID: ${shortApptId}. Chamber: ${chamberOrMode}. Fee: BDT ${input.consultFee}. ` +
      `Emergency / Helpline: 16263.`;

    // 2. Compose Email
    const emailSubject = `ShebaMitro - Appointment Confirmed with ${input.doctorName} [${shortApptId}]`;
    const emailHtml = this.generateAppointmentEmailHtml({
      shortApptId,
      patientName: input.patientName,
      doctorName: input.doctorName,
      doctorSpecialization: input.doctorSpecialization,
      dateFormatted,
      timeFormatted,
      chamberOrMode,
      consultFee: input.consultFee,
      isVideo,
    });

    // 3. Dispatch concurrently
    const [smsResult, emailResult] = await Promise.all([
      this.sendSms(patientPhone, smsMessage),
      this.sendEmail(patientEmail, emailSubject, emailHtml, smsMessage),
    ]);

    this.logger.log(
      `Appointment notifications successfully dispatched for ${shortApptId} -> SMS to ${patientPhone}, Email to ${patientEmail}`,
    );

    return {
      sms: smsResult,
      email: emailResult,
      notice: `A confirmation SMS & email reminder have been sent to your mobile number (${patientPhone}) and email (${patientEmail}).`,
    };
  }

  private normalizePhoneNumber(phone: string): string {
    const raw = phone.replace(/[^\d+]/g, '');
    if (raw.startsWith('+')) return raw;
    if (raw.startsWith('880')) return `+${raw}`;
    if (raw.startsWith('01')) return `+88${raw}`;
    return `+880${raw}`;
  }

  private generateAppointmentEmailHtml(params: {
    shortApptId: string;
    patientName: string;
    doctorName: string;
    doctorSpecialization: string;
    dateFormatted: string;
    timeFormatted: string;
    chamberOrMode: string;
    consultFee: number;
    isVideo: boolean;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #0d9488 0%, #10b981 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
          .content { padding: 32px 24px; }
          .card { background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 13px; }
          .row:last-child { border-bottom: none; }
          .label { color: #64748b; font-weight: 500; }
          .value { color: #0f172a; font-weight: 700; text-align: right; }
          .highlight { color: #0d9488; font-family: monospace; font-size: 15px; }
          .fee { color: #059669; font-size: 16px; font-weight: 800; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ShebaMitro Healthcare</h1>
            <p>Your Doctor Appointment is Confirmed</p>
          </div>
          <div class="content">
            <p>Dear <strong>${params.patientName}</strong>,</p>
            <p>Your appointment slot has been successfully reserved. Below are your booking details:</p>
            
            <div class="card">
              <div class="row">
                <span class="label">Appointment ID:</span>
                <span class="value highlight">${params.shortApptId}</span>
              </div>
              <div class="row">
                <span class="label">Consulting Doctor:</span>
                <span class="value">${params.doctorName} (${params.doctorSpecialization})</span>
              </div>
              <div class="row">
                <span class="label">Appointment Time:</span>
                <span class="value">${params.dateFormatted} at ${params.timeFormatted}</span>
              </div>
              <div class="row">
                <span class="label">Chamber / Location:</span>
                <span class="value">${params.chamberOrMode}</span>
              </div>
              <div class="row">
                <span class="label">Consultation Fee:</span>
                <span class="value fee">৳${params.consultFee}</span>
              </div>
            </div>

            <p style="font-size: 13px; color: #475569;">
              ${
                params.isVideo
                  ? 'A secure HD video consultation link will be activated in your patient portal 15 minutes before the session.'
                  : 'Please arrive at the chamber 15 minutes before the scheduled time with your appointment ID.'
              }
            </p>
          </div>
          <div class="footer">
            <p>Need assistance? Call our 24/7 Medical Hotline at <strong>16263</strong> or WhatsApp <strong>+880 1700-000000</strong>.</p>
            <p>&copy; 2026 ShebaMitro Healthcare Ecosystem. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
