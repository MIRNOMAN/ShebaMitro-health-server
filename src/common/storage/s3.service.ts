import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadedFileResult {
  key: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileUrl: string;
  presignedUrl: string;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>(
      'AWS_S3_BUCKET',
      'shebamitro-attachments',
    );
    this.region = this.configService.get<string>('AWS_S3_REGION', 'us-east-1');

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (accessKeyId && secretAccessKey) {
      try {
        this.s3Client = new S3Client({
          region: this.region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        this.logger.log('S3Client initialized successfully');
      } catch (err: any) {
        this.logger.warn(`Failed to initialize S3Client: ${err.message}`);
      }
    } else {
      this.logger.warn(
        'AWS credentials missing. S3Service using mock presigned URL fallback.',
      );
    }
  }

  /**
   * Upload file (patient scan or doctor report) to S3 and generate presigned URL
   */
  async uploadAttachment(
    file: Express.Multer.File,
    appointmentId: string,
  ): Promise<UploadedFileResult> {
    const sanitizedName = (file.originalname || 'file').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const key = `chat/appointments/${appointmentId}/${Date.now()}-${sanitizedName}`;

    let presignedUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    if (this.s3Client) {
      try {
        const putCommand = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });

        await this.s3Client.send(putCommand);

        const getCommand = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });

        // Generate presigned GET URL valid for 7 days (604,800 seconds)
        presignedUrl = await getSignedUrl(this.s3Client, getCommand, {
          expiresIn: 604800,
        });
        this.logger.log(
          `Successfully uploaded ${key} to S3 and generated presigned URL`,
        );
      } catch (err: any) {
        this.logger.error(`S3 upload error for key ${key}: ${err.message}`);
      }
    } else {
      this.logger.log(`Mock S3 upload executed for key: ${key}`);
    }

    const publicUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      key,
      originalName: file.originalname || 'attachment',
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size || 0,
      fileUrl: presignedUrl || publicUrl,
      presignedUrl: presignedUrl || publicUrl,
    };
  }

  /**
   * Upload Buffer (e.g. rendered PDF) to private S3 bucket and return presigned URL
   */
  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string = 'application/pdf',
  ): Promise<UploadedFileResult> {
    let presignedUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    if (this.s3Client) {
      try {
        const putCommand = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        });

        await this.s3Client.send(putCommand);

        const getCommand = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });

        presignedUrl = await getSignedUrl(this.s3Client, getCommand, {
          expiresIn: 604800,
        });
        this.logger.log(`Uploaded buffer to S3 key: ${key}`);
      } catch (err: any) {
        this.logger.error(
          `S3 uploadBuffer error for key ${key}: ${err.message}`,
        );
      }
    } else {
      this.logger.log(`Mock S3 uploadBuffer executed for key: ${key}`);
    }

    const publicUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      key,
      originalName: key.split('/').pop() || 'document.pdf',
      mimeType: contentType,
      size: buffer.length,
      fileUrl: presignedUrl || publicUrl,
      presignedUrl: presignedUrl || publicUrl,
    };
  }
}
