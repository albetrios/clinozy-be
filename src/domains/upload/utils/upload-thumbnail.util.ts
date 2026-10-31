import sharp from 'sharp';

/** The longest side of a thumbnail, in pixels — a smaller image is never enlarged. */
export const UPLOAD_THUMBNAIL_MAX_DIMENSION = 320;

/** The WebP quality (1–100) a thumbnail is encoded at. */
export const UPLOAD_THUMBNAIL_WEBP_QUALITY = 80;

/** The content type every thumbnail is stored under. */
export const UPLOAD_THUMBNAIL_CONTENT_TYPE = 'image/webp';

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
 *   can decode (a corrupt or unsupported file) — the caller keeps the full image.
 * - **Notes:** pure — no storage, no database; a decode is capped at sharp's default pixel limit.
 */
export async function createImageThumbnail(image: Buffer): Promise<Buffer> {
  try {
    return await sharp(image)
      .rotate()
      .resize({
        width: UPLOAD_THUMBNAIL_MAX_DIMENSION,
        height: UPLOAD_THUMBNAIL_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: UPLOAD_THUMBNAIL_WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    throw new UploadThumbnailSourceError(error);
  }
}

/** The source of a thumbnail is no image the transform can read. */
export class UploadThumbnailSourceError extends Error {
  constructor(cause: unknown) {
    super('upload.thumbnail_source_unreadable', { cause });
    this.name = 'UploadThumbnailSourceError';
  }
}
