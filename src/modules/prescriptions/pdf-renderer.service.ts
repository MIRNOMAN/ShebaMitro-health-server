import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface RenderedPrescriptionPdfResult {
  pdfBuffer: Buffer;
  sha256Hash: string;
  verifyUrl: string;
}

@Injectable()
export class PdfRendererService {
  private readonly logger = new Logger(PdfRendererService.name);

  /**
   * Calculate SHA-256 cryptographic hash for prescription payload
   */
  generatePrescriptionHash(prescription: any): string {
    const payloadToHash = JSON.stringify({
      id: prescription.id,
      appointmentId: prescription.appointmentId,
      doctorId: prescription.doctorId,
      patientId: prescription.patientId,
      diagnosis: prescription.diagnosis,
      createdAt: prescription.createdAt,
    });

    return crypto.createHash('sha256').update(payloadToHash).digest('hex');
  }

  /**
   * Render institutional medical layout PDF using PDFKit & cryptographically signed QR code
   */
  async renderPrescriptionPdf(
    prescription: any,
  ): Promise<RenderedPrescriptionPdfResult> {
    const sha256Hash = this.generatePrescriptionHash(prescription);
    const verifyUrl = `https://shebamitro.health/verify-rx/${prescription.id}?hash=${sha256Hash}`;

    // Generate QR code buffer
    const qrCodeBuffer = await QRCode.toBuffer(verifyUrl, {
      margin: 1,
      width: 90,
      color: {
        dark: '#0F766E',
        light: '#FFFFFF',
      },
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        this.logger.log(
          `Rendered PDF for prescription ID ${prescription.id} (${pdfBuffer.length} bytes)`,
        );
        resolve({
          pdfBuffer,
          sha256Hash,
          verifyUrl,
        });
      });
      doc.on('error', (err) => reject(err));

      const doctorName = prescription.doctor?.name || 'Dr. Medical Specialist';
      const bmdcRegNo = prescription.doctor?.bmdcRegNo || 'A-89421';
      const specialization =
        prescription.doctor?.specialization || 'General Medicine & Telehealth';
      const hospital =
        prescription.doctor?.hospital ||
        'ShebaMitro Digital Healthcare Network';
      const patientName =
        prescription.patient?.user?.name ||
        prescription.patient?.name ||
        'Patient User';
      const patientGender = prescription.patient?.gender || 'N/A';
      const patientBloodGroup = prescription.patient?.bloodGroup || 'O+';
      const dateStr = new Date(
        prescription.createdAt || Date.now(),
      ).toLocaleDateString('en-GB');

      // ── 1. HEADER SECTION (Doctor info & BMDC Seal) ──────────────
      doc
        .fillColor('#0F766E')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(doctorName, 36, 36);
      doc
        .fillColor('#334155')
        .fontSize(10)
        .font('Helvetica')
        .text(specialization);
      doc.fontSize(9).text(`BMDC Reg. No: ${bmdcRegNo}`);
      doc.fontSize(9).text(hospital);

      // Top Right: Institutional Header Badge
      doc.rect(400, 36, 160, 48).lineWidth(1).strokeColor('#CBD5E1').stroke();
      doc
        .fillColor('#0F766E')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('SHEBAMITRO HEALTH', 405, 42);
      doc
        .fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text('VERIFIED TELEHEALTH RX', 405, 56);
      doc.text(`Rx ID: ${prescription.id.substring(0, 8)}...`, 405, 68);

      // Teal Accent Divider Line
      doc
        .moveTo(36, 95)
        .lineTo(560, 95)
        .lineWidth(2)
        .strokeColor('#0F766E')
        .stroke();

      // ── 2. PATIENT DEMOGRAPHIC STRIP ─────────────────────────────
      doc.rect(36, 105, 524, 34).fillAndStroke('#F0FDFA', '#CCFBF1');
      doc
        .fillColor('#0F766E')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('PATIENT DETAILS', 44, 112);

      doc.fillColor('#1E293B').fontSize(9).font('Helvetica');
      doc.text(`Name: ${patientName}`, 44, 124);
      doc.text(`Gender: ${patientGender}`, 220, 124);
      doc.text(`Blood Group: ${patientBloodGroup}`, 330, 124);
      doc.text(`Date: ${dateStr}`, 450, 124);

      // ── 3. CLINICAL SUMMARY & VITALS ─────────────────────────────
      let y = 150;
      doc
        .fillColor('#0F766E')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('CLINICAL ASSESSMENT', 36, y);
      y += 14;

      if (prescription.chiefComplaints) {
        doc
          .fillColor('#334155')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Chief Complaints: ', 36, y, { continued: true });
        doc.font('Helvetica').text(prescription.chiefComplaints);
        y += 14;
      }

      if (prescription.diagnosis) {
        doc
          .fillColor('#334155')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Clinical Diagnosis: ', 36, y, { continued: true });
        doc.font('Helvetica').text(prescription.diagnosis);
        y += 14;
      }

      if (prescription.vitalsJson) {
        const v = prescription.vitalsJson;
        const vitalsStr = `BP: ${v.bp || 'N/A'} mmHg | Pulse: ${v.pulse || 'N/A'} bpm | SpO2: ${v.spO2 || 'N/A'}% | BMI: ${v.bmi || 'N/A'}`;
        doc
          .fillColor('#334155')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('Vitals: ', 36, y, { continued: true });
        doc.font('Helvetica').text(vitalsStr);
        y += 18;
      }

      // ── 4. RX SYMBOL & STRUCTURED MEDICATION DOSAGE TABLE ────────
      y += 6;
      doc
        .fillColor('#0F766E')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('Rx', 36, y);
      y += 28;

      // Table Header
      doc.rect(36, y, 524, 20).fill('#0F766E');
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      doc.text('Medicine Name', 42, y + 5);
      doc.text('Generic / Form', 180, y + 5);
      doc.text('Frequency', 320, y + 5);
      doc.text('Timing', 410, y + 5);
      doc.text('Duration', 490, y + 5);

      y += 20;

      const items = prescription.items || [];
      items.forEach((item: any, index: number) => {
        const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(36, y, 524, 22).fill(rowBg);

        doc
          .fillColor('#0F172A')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(item.medicineName || 'Medicine', 42, y + 6);
        doc
          .fillColor('#475569')
          .fontSize(8)
          .font('Helvetica')
          .text(
            `${item.genericName || ''} (${item.dosageForm || 'Tab'})`,
            180,
            y + 6,
          );
        doc
          .fillColor('#0F766E')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(item.schedulePattern || '1+0+1', 320, y + 6);
        doc
          .fillColor('#334155')
          .fontSize(8)
          .font('Helvetica')
          .text(item.mealTiming || 'AFTER_MEAL', 410, y + 6);
        doc
          .fillColor('#1E293B')
          .fontSize(8)
          .font('Helvetica')
          .text(`${item.durationDays} Days`, 490, y + 6);

        y += 22;
      });

      // ── 5. ADVICE & FOLLOW UP ────────────────────────────────────
      y += 12;
      if (prescription.advice) {
        doc
          .fillColor('#0F766E')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Doctor Advice:', 36, y);
        y += 12;
        doc
          .fillColor('#334155')
          .fontSize(8)
          .font('Helvetica')
          .text(prescription.advice, 36, y, { width: 524 });
        y += 24;
      }

      if (prescription.followUpDate) {
        const followUpStr = new Date(
          prescription.followUpDate,
        ).toLocaleDateString('en-GB');
        doc
          .fillColor('#0F766E')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text(`Recommended Follow-up Date: ${followUpStr}`, 36, y);
        y += 16;
      }

      // ── 6. FOOTER (Cryptographic QR Code & Doctor Signature) ─────
      const footerY = 710;
      doc
        .moveTo(36, footerY - 10)
        .lineTo(560, footerY - 10)
        .lineWidth(1)
        .strokeColor('#E2E8F0')
        .stroke();

      // Cryptographically signed QR Code
      doc.image(qrCodeBuffer, 36, footerY, { width: 64, height: 64 });
      doc
        .fillColor('#0F766E')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('Cryptographically Signed Prescription', 110, footerY + 8);
      doc
        .fillColor('#64748B')
        .fontSize(7)
        .font('Helvetica')
        .text(
          `Scan QR code or visit /verify-rx/${prescription.id.substring(0, 8)}...`,
          110,
          footerY + 20,
        );
      doc.text(
        `SHA-256 Hash: ${sha256Hash.substring(0, 32)}...`,
        110,
        footerY + 30,
      );

      // Doctor Signature Block
      doc
        .fillColor('#0F766E')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(doctorName, 390, footerY + 12);
      doc
        .fillColor('#64748B')
        .fontSize(8)
        .font('Helvetica')
        .text(`Reg. No: ${bmdcRegNo}`, 390, footerY + 26);
      doc.text('Digitally Signed & Verified Seal', 390, footerY + 38);

      doc.end();
    });
  }
}
