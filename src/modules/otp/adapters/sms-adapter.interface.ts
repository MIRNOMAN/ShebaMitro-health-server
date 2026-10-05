/**
 * Pluggable SMS Adapter interface for multi-gateway support.
 */
export interface SmsAdapter {
  sendSms(to: string, message: string): Promise<boolean>;
}
