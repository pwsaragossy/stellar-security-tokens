/**
 * imageValidation.js — magic-byte validation for collateral photo uploads.
 *
 * Multer's MIME type comes from the client and the filename extension can be
 * forged, so acceptance is decided by file signature (magic bytes) only.
 * Allowed formats: JPEG, PNG, WebP.
 */

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per photo
export const MAX_PHOTOS_PER_OFFER = 10;

export class InvalidImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/**
 * Detects the real image type from the buffer's magic bytes.
 * @param {Buffer} buffer - File contents
 * @returns {('image/jpeg'|'image/png'|'image/webp'|null)} detected MIME or null
 */
export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates a single photo upload (signature + size).
 * @param {Buffer} buffer - File contents
 * @param {string} fileName - Original file name (for error messages only)
 * @throws {InvalidImageError} when the file is not an accepted image
 * @returns {{ mime: string }} the detected MIME type
 */
export function validatePhotoUpload(buffer, fileName = 'photo') {
  const mime = detectImageMime(buffer);
  if (!mime) {
    throw new InvalidImageError(
      `Invalid photo "${fileName}": file is not a JPEG, PNG or WebP image`
    );
  }
  if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
    throw new InvalidImageError(
      `Invalid photo "${fileName}": exceeds ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB limit`
    );
  }
  return { mime };
}

/**
 * Validates the total photo count for an offer (existing + incoming).
 * @param {number} existingCount - Photos already stored on the offer
 * @param {number} incomingCount - Photos in the current upload
 * @throws {InvalidImageError} when the combined count exceeds the cap
 */
export function validatePhotoCount(existingCount, incomingCount) {
  const total = (existingCount || 0) + (incomingCount || 0);
  if (total > MAX_PHOTOS_PER_OFFER) {
    throw new InvalidImageError(
      `Too many photos: offers support at most ${MAX_PHOTOS_PER_OFFER} (got ${total})`
    );
  }
}
