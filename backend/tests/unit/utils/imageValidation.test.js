/**
 * imageValidation.test.js — magic-byte image validation for collateral photos.
 *
 * Run: NODE_ENV=test node --import tsx --test tests/unit/utils/imageValidation.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
    detectImageMime,
    validatePhotoUpload,
    validatePhotoCount,
    InvalidImageError,
    MAX_PHOTO_SIZE_BYTES,
    MAX_PHOTOS_PER_OFFER,
} from '../../../src/utils/imageValidation.js';

// Minimal valid headers padded past the 12-byte sniff window
const jpegBuffer = (size = 64) => {
    const b = Buffer.alloc(size);
    b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
    return b;
};
const pngBuffer = (size = 64) => {
    const b = Buffer.alloc(size);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
    return b;
};
const webpBuffer = (size = 64) => {
    const b = Buffer.alloc(size);
    b.write('RIFF', 0, 'ascii');
    b.write('WEBP', 8, 'ascii');
    return b;
};

describe('detectImageMime', () => {
    test('detects JPEG by FF D8 FF signature', () => {
        assert.strictEqual(detectImageMime(jpegBuffer()), 'image/jpeg');
    });

    test('detects PNG by 8-byte signature', () => {
        assert.strictEqual(detectImageMime(pngBuffer()), 'image/png');
    });

    test('detects WebP by RIFF....WEBP container', () => {
        assert.strictEqual(detectImageMime(webpBuffer()), 'image/webp');
    });

    test('rejects PDF magic bytes (%PDF)', () => {
        const pdf = Buffer.alloc(64);
        pdf.write('%PDF-1.4', 0, 'ascii');
        assert.strictEqual(detectImageMime(pdf), null);
    });

    test('rejects RIFF non-WebP (e.g. WAV)', () => {
        const wav = Buffer.alloc(64);
        wav.write('RIFF', 0, 'ascii');
        wav.write('WAVE', 8, 'ascii');
        assert.strictEqual(detectImageMime(wav), null);
    });

    test('rejects buffers shorter than the sniff window', () => {
        assert.strictEqual(detectImageMime(Buffer.from([0xff, 0xd8, 0xff])), null);
    });

    test('rejects non-buffer input', () => {
        assert.strictEqual(detectImageMime('not a buffer'), null);
        assert.strictEqual(detectImageMime(null), null);
    });
});

describe('validatePhotoUpload', () => {
    test('accepts a valid JPEG within size limit', () => {
        const { mime } = validatePhotoUpload(jpegBuffer(), 'lot.jpg');
        assert.strictEqual(mime, 'image/jpeg');
    });

    test('throws InvalidImageError for a renamed non-image (extension is irrelevant)', () => {
        const fake = Buffer.alloc(64); // zeroes — no valid signature
        assert.throws(
            () => validatePhotoUpload(fake, 'malware.jpg'),
            InvalidImageError
        );
    });

    test('throws InvalidImageError when over the per-photo size cap', () => {
        const big = jpegBuffer(MAX_PHOTO_SIZE_BYTES + 1);
        assert.throws(
            () => validatePhotoUpload(big, 'huge.jpg'),
            /exceeds 5MB/
        );
    });

    test('accepts a photo exactly at the size cap', () => {
        const exact = jpegBuffer(MAX_PHOTO_SIZE_BYTES);
        assert.doesNotThrow(() => validatePhotoUpload(exact, 'exact.jpg'));
    });
});

describe('validatePhotoCount', () => {
    test('accepts up to the cap', () => {
        assert.doesNotThrow(() => validatePhotoCount(0, MAX_PHOTOS_PER_OFFER));
        assert.doesNotThrow(() => validatePhotoCount(MAX_PHOTOS_PER_OFFER - 1, 1));
    });

    test('rejects when existing + incoming exceeds the cap', () => {
        assert.throws(() => validatePhotoCount(MAX_PHOTOS_PER_OFFER, 1), InvalidImageError);
        assert.throws(() => validatePhotoCount(5, 6), /at most 10/);
    });

    test('treats undefined counts as zero', () => {
        assert.doesNotThrow(() => validatePhotoCount(undefined, undefined));
    });
});
