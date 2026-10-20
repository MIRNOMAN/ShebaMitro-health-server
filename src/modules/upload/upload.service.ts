import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import path from 'path';

export interface UploadedFileResponse {
  url: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'images');

  constructor(private readonly configService: ConfigService) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private getBaseUrl(): string {
    const port = this.configService.get<number>('PORT', 5100);
    const envUrl = process.env.APP_URL;
    if (envUrl) {
      return envUrl.replace(/\/$/, '');
    }
    return `http://localhost:${port}`;
  }

  private validateImage(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype || 'unknown'}. Only image files are allowed`,
      );
    }
    // Limit 10MB
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('Image size exceeds maximum limit of 10MB');
    }
  }

  private saveFileToDisk(file: Express.Multer.File): UploadedFileResponse {
    this.validateImage(file);

    const ext = path.extname(file.originalname || '') || '.jpg';
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const baseName = path
      .basename(file.originalname || 'image', ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const filename = `${baseName}-${uniqueSuffix}${cleanExt}`;
    const targetPath = path.join(this.uploadDir, filename);

    fs.writeFileSync(targetPath, file.buffer);

    const url = `${this.getBaseUrl()}/uploads/images/${filename}`;

    return {
      url,
      filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload a single image
   */
  async uploadSingle(file: Express.Multer.File): Promise<UploadedFileResponse> {
    return this.saveFileToDisk(file);
  }

  /**
   * Upload multiple images
   */
  async uploadMultiple(
    files: Express.Multer.File[],
  ): Promise<UploadedFileResponse[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for multiple upload');
    }
    return files.map((file) => this.saveFileToDisk(file));
  }

  /**
   * Extract filename from a full URL or relative path or filename string
   */
  private extractFilename(urlOrFilename: string): string {
    if (!urlOrFilename) return '';
    try {
      if (
        urlOrFilename.startsWith('http://') ||
        urlOrFilename.startsWith('https://')
      ) {
        const parsed = new URL(urlOrFilename);
        return path.basename(parsed.pathname);
      }
    } catch {
      // fallback if not valid URL
    }
    return path.basename(urlOrFilename);
  }

  /**
   * Delete a file from disk by URL or filename
   */
  async deleteFile(
    urlOrFilename: string,
  ): Promise<{ deleted: boolean; filename: string }> {
    if (!urlOrFilename) {
      return { deleted: false, filename: '' };
    }

    const filename = this.extractFilename(urlOrFilename);
    if (!filename) {
      return { deleted: false, filename: '' };
    }

    // Check in uploads/images, uploads/avatars, or uploads root
    const potentialPaths = [
      path.join(this.uploadDir, filename),
      path.join(process.cwd(), 'uploads', 'avatars', filename),
      path.join(process.cwd(), 'uploads', filename),
    ];

    let deleted = false;
    for (const filePath of potentialPaths) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deleted = true;
          this.logger.log(`Deleted file: ${filePath}`);
          break;
        } catch (err: any) {
          this.logger.error(`Error deleting file ${filePath}: ${err.message}`);
        }
      }
    }

    return { deleted, filename };
  }

  /**
   * Delete multiple files
   */
  async deleteMultipleFiles(
    identifiers: string[],
  ): Promise<Array<{ deleted: boolean; filename: string }>> {
    const results: Array<{ deleted: boolean; filename: string }> = [];
    for (const id of identifiers) {
      if (id) {
        const res = await this.deleteFile(id);
        results.push(res);
      }
    }
    return results;
  }

  /**
   * Update / replace a single image
   */
  async updateSingle(
    file: Express.Multer.File,
    oldUrlOrFilename?: string,
  ): Promise<{ newImage: UploadedFileResponse; previousDeleted: boolean }> {
    let previousDeleted = false;
    if (oldUrlOrFilename) {
      const delResult = await this.deleteFile(oldUrlOrFilename);
      previousDeleted = delResult.deleted;
    }

    const newImage = this.saveFileToDisk(file);
    return {
      newImage,
      previousDeleted,
    };
  }

  /**
   * Update / replace multiple images
   */
  async updateMultiple(
    files: Express.Multer.File[],
    oldUrlsOrFilenames?: string[],
  ): Promise<{
    newImages: UploadedFileResponse[];
    deletedCount: number;
  }> {
    let deletedCount = 0;
    if (oldUrlsOrFilenames && oldUrlsOrFilenames.length > 0) {
      const delResults = await this.deleteMultipleFiles(oldUrlsOrFilenames);
      deletedCount = delResults.filter((r) => r.deleted).length;
    }

    const newImages = await this.uploadMultiple(files);
    return {
      newImages,
      deletedCount,
    };
  }
}
