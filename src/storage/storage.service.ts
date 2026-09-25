import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { EnvironmentVariables } from '../config/env.validation';
import {
  ALLOWED_IMAGE_TYPES,
  AllowedImageMimeType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_UPLOAD,
  StorageFolder,
} from './storage.constants';

export interface UploadedImage {
  url: string;
  path: string;
  mimeType: AllowedImageMimeType;
  size: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;
  private readonly publicUrlPrefix: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const supabaseUrl = config.get('SUPABASE_URL', { infer: true }).replace(/\/+$/, '');
    this.bucket = config.get('SUPABASE_BUCKET_NAME', { infer: true });
    this.client = createClient(supabaseUrl, config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // Node < 22 has no global WebSocket; realtime-js throws at construction without one.
      realtime: { transport: WebSocket as never },
    });
    this.publicUrlPrefix = `${supabaseUrl}/storage/v1/object/public/${this.bucket}/`;
  }

  /** Creates the public bucket on first boot if it does not exist yet. */
  async onModuleInit(): Promise<void> {
    try {
      const { error } = await this.client.storage.getBucket(this.bucket);
      if (!error) return;

      const { error: createError } = await this.client.storage.createBucket(this.bucket, {
        public: true,
        fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
        allowedMimeTypes: Object.keys(ALLOWED_IMAGE_TYPES),
      });
      if (createError && !/already exists/i.test(createError.message)) {
        throw createError;
      }
      this.logger.log(`Created storage bucket "${this.bucket}"`);
    } catch (err) {
      this.logger.warn(
        `Could not verify storage bucket "${this.bucket}": ${(err as Error).message}. ` +
          'Uploads will fail until the bucket exists and is public.',
      );
    }
  }

  /**
   * Validates size and the file's real type from its magic bytes. The client-declared MIME type
   * is ignored because mobile clients often send "image/jpg" or "application/octet-stream".
   * Returns the detected MIME type, which is also used as the stored Content-Type.
   */
  validateImage(file: Express.Multer.File): AllowedImageMimeType {
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException(`"${file?.originalname ?? 'file'}" is empty`);
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        `"${file.originalname}" exceeds the ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB limit`,
      );
    }

    const detected = detectImageType(file.buffer);
    if (!detected) {
      const hint = /hei[cf]/i.test(`${file.mimetype} ${file.originalname}`)
        ? ' HEIC photos must be converted to JPG first (iPhone: Settings → Camera → Formats → Most Compatible).'
        : '';
      throw new BadRequestException(
        `"${file.originalname}" (${file.mimetype}) is not a JPG, PNG or WEBP image.${hint}`,
      );
    }
    return detected;
  }

  async uploadImage(file: Express.Multer.File, folder: StorageFolder, ownerId: string): Promise<UploadedImage> {
    const mimeType = this.validateImage(file);
    return this.putObject(file, mimeType, folder, ownerId);
  }

  /** Validates every file before uploading any; rolls back already-uploaded files on failure. */
  async uploadImages(files: Express.Multer.File[], folder: StorageFolder, ownerId: string): Promise<UploadedImage[]> {
    if (!files?.length) {
      throw new BadRequestException('No files provided. Send multipart/form-data with one or more "files" fields');
    }
    if (files.length > MAX_IMAGES_PER_UPLOAD) {
      throw new BadRequestException(`At most ${MAX_IMAGES_PER_UPLOAD} images can be uploaded at once`);
    }

    const validated = files.map((file) => ({ file, mimeType: this.validateImage(file) }));
    const results = await Promise.allSettled(
      validated.map(({ file, mimeType }) => this.putObject(file, mimeType, folder, ownerId)),
    );

    const uploaded = results
      .filter((r): r is PromiseFulfilledResult<UploadedImage> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
      await this.removeObjects(uploaded.map((u) => u.path));
      throw failure.reason;
    }
    return uploaded;
  }

  async removeObjects(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) {
      this.logger.warn(`Failed to remove ${paths.length} object(s): ${error.message}`);
    }
  }

  /** True when the URL points to an object in this app's public bucket. */
  isManagedUrl(url: string): boolean {
    return typeof url === 'string' && url.startsWith(this.publicUrlPrefix) && !url.includes('..');
  }

  /** Prevents clients from storing arbitrary external URLs (tracking pixels, phishing links, ...). */
  assertManagedUrls(urls: string[]): void {
    const foreign = urls.filter((url) => !this.isManagedUrl(url));
    if (foreign.length > 0) {
      throw new BadRequestException(
        'Image URLs must be uploaded via POST /api/v1/storage/images first. Invalid: ' + foreign.join(', '),
      );
    }
  }

  private async putObject(
    file: Express.Multer.File,
    mimeType: AllowedImageMimeType,
    folder: StorageFolder,
    ownerId: string,
  ): Promise<UploadedImage> {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeOwner = ownerId.replace(/[^A-Za-z0-9_-]/g, '_');
    const path = `${folder}/${safeOwner}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[mimeType]}`;

    const { error } = await this.client.storage.from(this.bucket).upload(path, file.buffer, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      this.logger.error(`Upload failed for ${path}: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload image to storage');
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path, mimeType, size: file.size };
  }
}

/** Sniffs file signatures so a renamed executable can't masquerade as an image. */
function detectImageType(buffer: Buffer): AllowedImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
