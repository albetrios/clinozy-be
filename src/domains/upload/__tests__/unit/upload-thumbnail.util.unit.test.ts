import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  buildThumbnailObjectKey,
  createImageThumbnail,
  UPLOAD_THUMBNAIL_MAX_DIMENSION,
  UploadThumbnailSourceError,
} from '@/domains/upload/utils/upload-thumbnail.util.js';

/** A solid JPEG of the given size, with an EXIF orientation and a camera make. */
async function jpeg({
  width,
  height,
  orientation = 1,
}: {
  width: number;
  height: number;
  orientation?: number;
}): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c08060' } })
    .jpeg()
    .withMetadata({ orientation, exif: { IFD0: { Make: 'TestCamera' } } })
    .toBuffer();
}

describe('buildThumbnailObjectKey', () => {
  it('puts the thumbnail next to its source, without the extension', () => {
    expect(buildThumbnailObjectKey('organization-files/org_a/abc.jpg')).toBe(
      'organization-files/org_a/abc.thumb.webp',
    );
    expect(buildThumbnailObjectKey('organization-files/org_a/abc.photo.png')).toBe(
      'organization-files/org_a/abc.photo.thumb.webp',
    );
  });

  it('keeps a key without an extension whole (a dot in a folder is no extension)', () => {
    expect(buildThumbnailObjectKey('organization-files/org.a/abc')).toBe(
      'organization-files/org.a/abc.thumb.webp',
    );
  });
});

describe('createImageThumbnail', () => {
  it('fits the longest side to 320 px as WebP and drops the metadata', async () => {
    const thumbnail = await createImageThumbnail(await jpeg({ width: 1600, height: 800 }));
    const metadata = await sharp(thumbnail).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(UPLOAD_THUMBNAIL_MAX_DIMENSION);
    expect(metadata.height).toBe(160);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('turns the image upright by its EXIF orientation before resizing', async () => {
    // Orientation 6: stored landscape, shown rotated 90° — a portrait thumbnail
    const thumbnail = await createImageThumbnail(
      await jpeg({ width: 1600, height: 800, orientation: 6 }),
    );
    const metadata = await sharp(thumbnail).metadata();
    expect(metadata.width).toBe(160);
    expect(metadata.height).toBe(UPLOAD_THUMBNAIL_MAX_DIMENSION);
  });

  it('never enlarges a small image', async () => {
    const thumbnail = await createImageThumbnail(await jpeg({ width: 120, height: 90 }));
    const metadata = await sharp(thumbnail).metadata();
    expect([metadata.width, metadata.height]).toEqual([120, 90]);
  });

  it('refuses bytes that are no image', async () => {
    await expect(createImageThumbnail(Buffer.from('not an image'))).rejects.toBeInstanceOf(
      UploadThumbnailSourceError,
    );
  });
});
