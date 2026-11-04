import sharp from 'sharp';

/** The longest side of a thumbnail, in pixels — a smaller image is never enlarged. */
export const UPLOAD_THUMBNAIL_MAX_DIMENSION = 320;

/** The WebP quality (1–100) a thumbnail is encoded at. */
export const UPLOAD_THUMBNAIL_WEBP_QUALITY = 80;

/** The content type every thumbnail is stored under. */
export const UPLOAD_THUMBNAIL_CONTENT_TYPE = 'image/webp';

/**
 * The most pixels a thumbnail source may have (64 megapixels, e.g. 8000 × 8000); a larger image
 * keeps its full-size fallback.
 *
 * @remarks
 * - **Why this number:** the largest legitimate source is a 48–50 MP phone photo at full resolution
 *   (8160 × 6120 ≈ 49.9 MP) or a 61 MP full-frame camera (9504 × 6336 ≈ 60.2 MP); both fit. The
 *   cap bounds the worst case — a small PNG or WebP that claims huge dimensions (a decompression
 *   bomb) — to 64 M × 4 bytes ≈ 256 MB decoded, half the worker's 512 MiB RSS warning
 *   (docs/deployment/runbooks/resource-limits.md), where sharp's own default (268 MP) allows
 *   about 1 GB. 108 MP and 200 MP phone modes are refused and keep the full image.
 * - **Notes:** checked from the header, before any pixel is decoded.
 */
export const UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS = 64_000_000;

/**
 * How long one thumbnail may take to decode, resize and encode — a 36 MP PNG takes about half a
 * second; a source still running at 30 s is pathological and keeps its full-size fallback.
 */
export const UPLOAD_THUMBNAIL_TIMEOUT_SECONDS = 30;

/** What a thumbnail key ends with — it sits next to its source, with the source's name. */
export const UPLOAD_THUMBNAIL_KEY_SUFFIX = '.thumb.webp';

/**
 * The thumbnail key of a stored file: the source key without its extension, plus
 * {@link UPLOAD_THUMBNAIL_KEY_SUFFIX} (`organization-files/<org>/<uuid>.jpg` →
 * `organization-files/<org>/<uuid>.thumb.webp`).
 */
export function buildThumbnailObjectKey(sourceKey: string): string {
  const lastSlash = sourceKey.lastIndexOf('/');
  const lastDot = sourceKey.lastIndexOf('.');
  const base = lastDot > lastSlash ? sourceKey.slice(0, lastDot) : sourceKey;
  return `${base}${UPLOAD_THUMBNAIL_KEY_SUFFIX}`;
}

/**
 * Makes a thumbnail of an image: its longest side {@link UPLOAD_THUMBNAIL_MAX_DIMENSION} pixels
 * (never enlarged), turned upright by its EXIF orientation, encoded as WebP at
 * {@link UPLOAD_THUMBNAIL_WEBP_QUALITY}, with no metadata (EXIF, GPS, XMP, ICC are dropped).
 *
 * @remarks
 * - **Failure modes:** throws `UploadThumbnailSourceError` when the bytes are no image `sharp`
 *   can decode (a corrupt or unsupported file, `failOn: 'error'` — warnings pass), when the image
 *   has more than {@link UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS} pixels, or when the work runs past
 *   {@link UPLOAD_THUMBNAIL_TIMEOUT_SECONDS} — the caller keeps the full image.
 * - **Notes:** pure — no storage, no database. The worker that calls it runs
 *   {@link configureImageThumbnailDecoder} once at start.
 */
export async function createImageThumbnail(image: Buffer): Promise<Buffer> {
  try {
    return await sharp(image, {
      limitInputPixels: UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: UPLOAD_THUMBNAIL_MAX_DIMENSION,
        height: UPLOAD_THUMBNAIL_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: UPLOAD_THUMBNAIL_WEBP_QUALITY })
      .timeout({ seconds: UPLOAD_THUMBNAIL_TIMEOUT_SECONDS })
      .toBuffer();
  } catch (error) {
    throw new UploadThumbnailSourceError(error);
  }
}

/**
 * Sets the process-wide image decoder up for the thumbnail worker: no libvips operation cache
 * (a decoded photo is never reused, so a cache only holds memory) and one libvips thread per image
 * (the job runs one image at a time; one thread keeps its CPU bounded beside the other workers).
 *
 * @remarks
 * - **Side effects:** `sharp.cache(false)` and `sharp.concurrency(1)` — global to the process, so
 *   call it from the worker's start (`createPatientImageThumbnailWorker`), never from the API.
 */
export function configureImageThumbnailDecoder(): void {
  sharp.cache(false);
  sharp.concurrency(1);
}

/** The source of a thumbnail is no image the transform can read. */
export class UploadThumbnailSourceError extends Error {
  constructor(cause: unknown) {
    super('upload.thumbnail_source_unreadable', { cause });
    this.name = 'UploadThumbnailSourceError';
  }
}
