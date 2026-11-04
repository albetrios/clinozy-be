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
 *   (8160 × 6120 ≈ 49.9 MP) or a 61 MP full-frame camera (9504 × 6336 ≈ 60.2 MP); both fit, where
 *   sharp's own default lets a few-hundred-byte PNG claim 268 MP. 108 MP and 200 MP phone modes are
 *   refused and keep the full image.
 * - **Notes:** checked from the header, before any pixel is decoded. Pixels alone do not bound
 *   memory — a pixel can take 1 to 8 bytes — so {@link UPLOAD_THUMBNAIL_MAX_DECODED_BYTES} caps
 *   the decoded size too.
 */
export const UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS = 64_000_000;

/**
 * The most bytes a thumbnail source may decode to — 192 MB, an 8-bit RGB photo at
 * {@link UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS} (64 MP × 3 bytes); a source that would decode to more
 * keeps its full-size fallback.
 *
 * @remarks
 * - **Why this number:** an interlaced PNG is decoded whole before it is resized, so the decoded
 *   size is what the worker holds. Measured through this pipeline in a bare Node process (about
 *   40 MiB of its own): an 8000 × 8000 8-bit RGB interlaced PNG (192 MB) peaked at 280 MiB RSS; an
 *   8-bit RGBA one (256 MB) at 357 MiB; a 7999 × 8000 16-bit RGB one (384 MB, 570 KB of file) at
 *   489 MiB — 645 MiB inside the worker in review. At 192 MB a decode adds about 240 MiB to the
 *   process at worst; a photo with alpha gets up to 48 MP, a 16-bit one up to 32 MP. A JPEG
 *   decodes far smaller while it loads (shrink-on-load); counting it at full size refuses only a
 *   CMYK JPEG over 48 MP.
 * - **Notes:** computed from the header (width × height × channels × bytes per sample), before any
 *   pixel is decoded.
 */
export const UPLOAD_THUMBNAIL_MAX_DECODED_BYTES = UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS * 3;

/** Bytes per sample of each libvips band format (`sharp` metadata `depth`). */
const BYTES_PER_SAMPLE: Readonly<Record<string, number>> = {
  uchar: 1,
  char: 1,
  ushort: 2,
  short: 2,
  uint: 4,
  int: 4,
  float: 4,
  complex: 8,
  double: 8,
  dpcomplex: 16,
};

/** A depth `sharp` does not name above is counted at the widest sample, so it is never let through. */
const UNKNOWN_BYTES_PER_SAMPLE = 16;

/**
 * How long one thumbnail may take to decode, resize and encode — a 64 MP interlaced PNG takes
 * about 1.2 s on one thread; a source still running at 30 s is pathological and keeps its
 * full-size fallback (a final skip — a restore runs the job again).
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
 * - **Algorithm:** reads the header first (`metadata()`, which also applies the pixel cap) and
 *   refuses a source whose decoded size would pass {@link UPLOAD_THUMBNAIL_MAX_DECODED_BYTES};
 *   only then decodes, resizes and encodes.
 * - **Failure modes:** throws `UploadThumbnailSourceError` when the bytes are no image `sharp`
 *   can decode (a corrupt or unsupported file, `failOn: 'error'` — warnings pass), when the image
 *   has more than {@link UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS} pixels or would decode to more than
 *   {@link UPLOAD_THUMBNAIL_MAX_DECODED_BYTES}, or when the work runs past
 *   {@link UPLOAD_THUMBNAIL_TIMEOUT_SECONDS} — the caller keeps the full image.
 * - **Notes:** pure — no storage, no database. The worker that calls it runs
 *   {@link configureImageThumbnailDecoder} once at start.
 */
export async function createImageThumbnail(image: Buffer): Promise<Buffer> {
  const decoderOptions = {
    limitInputPixels: UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS,
    failOn: 'error',
  } as const;
  try {
    const { width, height, channels, depth } = await sharp(image, decoderOptions).metadata();
    const decodedBytes =
      (width ?? 0) *
      (height ?? 0) *
      (channels ?? 0) *
      (BYTES_PER_SAMPLE[depth ?? ''] ?? UNKNOWN_BYTES_PER_SAMPLE);
    if (decodedBytes > UPLOAD_THUMBNAIL_MAX_DECODED_BYTES) {
      throw new Error(
        `Input image would decode to ${decodedBytes} bytes, over the ${UPLOAD_THUMBNAIL_MAX_DECODED_BYTES}-byte budget`,
      );
    }
    return await sharp(image, decoderOptions)
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
