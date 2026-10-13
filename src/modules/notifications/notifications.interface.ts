export interface AppointmentNotificationInput {
  appointmentId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  doctorName: string;
  doctorSpecialization: string;
  slotStartTime: Date | string;
  slotEndTime: Date | string;
  chamberName: string;
  consultFee: number;
  type?: 'CHAMBER' | 'ONLINE' | string;
}

export interface SmsDeliveryStatus {
  success: boolean;
  recipient: string;
  messageId: string;
  message: string;
  dispatchedAt: string;
}

export interface EmailDeliveryStatus {
  success: boolean;
  recipient: string;
  messageId: string;
  subject: string;
  dispatchedAt: string;
}

export interface AppointmentNotificationResult {
  sms: SmsDeliveryStatus;
  email: EmailDeliveryStatus;
  notice: string;
}
