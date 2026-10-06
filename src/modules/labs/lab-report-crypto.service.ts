import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptPdfResult {
  encryptedBuffer: Buffer;
  encryptionKeyHex: string;
  ivHex: string;
  authTagHex: string;
}

export interface SmsDispatchInput {
  patientPhone: string;
  patientName: string;
  orderId: string;
  reportUrl: string;
}

@Injectable()
export class LabReportCryptoService {
  private readonly logger = new Logger(LabReportCryptoService.name);
  private readonly defaultSecretKey =
    process.env.PDF_ENCRYPTION_SECRET || 'shebamitro-lab-pdf-secret-key-32b!';

  /**
   * Encrypt PDF buffer using AES-256-GCM authenticated encryption
   */
  encryptPdfBuffer(pdfBuffer: Buffer, passkey?: string): EncryptPdfResult {
    const key = crypto
      .createHash('sha256')
      .update(passkey || this.defaultSecretKey)
      .digest(); // 32 bytes key
    const iv = crypto.randomBytes(12); // 12 bytes IV for AES-GCM

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(pdfBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    this.logger.log(
      `Successfully encrypted PDF buffer of size ${pdfBuffer.length} bytes into AES-256-GCM payload`,
    );

    return {
      encryptedBuffer: encrypted,
      encryptionKeyHex: key.toString('hex'),
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt AES-256-GCM encrypted PDF buffer
   */
  decryptPdfBuffer(
    encryptedBuffer: Buffer,
    ivHex: string,
    authTagHex: string,
    passkey?: string,
  ): Buffer {
    const key = crypto
      .createHash('sha256')
      .update(passkey || this.defaultSecretKey)
      .digest();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
    return decrypted;
  }

  /**
   * Dispatch patient SMS notification for completed lab report
   */
  async dispatchPatientSms(input: SmsDispatchInput): Promise<any> {
    const { patientPhone, patientName, orderId, reportUrl } = input;
    const cleanPhone = patientPhone.replace(/\D/g, '');

    const message = `Dear ${patientName || 'Patient'}, your encrypted lab report for order #${orderId} is now ready. View report: ${reportUrl}`;

    this.logger.log(
      `Dispatching SMS notification for order ${orderId} to ${cleanPhone}: "${message}"`,
    );

    // Simulated SMS Gateway integration (e.g. Twilio / SSL Wireless SMS Gateway)
    return {
      success: true,
      provider: 'ShebaMitro SMS Gateway',
      recipient: cleanPhone,
      message,
      dispatchedAt: new Date().toISOString(),
    };
  }
}
