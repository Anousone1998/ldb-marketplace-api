export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_UPLOAD = 10;

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AllowedImageMimeType = keyof typeof ALLOWED_IMAGE_TYPES;

export enum StorageFolder {
  ITEMS = 'items',
  QR_CODES = 'qr-codes',
  PAYMENT_SLIPS = 'payment-slips',
}
