import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  buildThumbnailObjectKey,
  configureImageThumbnailDecoder,
  createImageThumbnail,
  UPLOAD_THUMBNAIL_MAX_DIMENSION,
  UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS,
  UploadThumbnailSourceError,
} from '@/domains/upload/utils/upload-thumbnail.util.js';
import { oversizedPngHeader } from '@/tests/helpers/oversized-image.helper.js';

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

  it('refuses an image over the pixel cap from its header, before decoding it', async () => {
    // 9000 × 9000 = 81 MP in 70-odd bytes — under sharp's own 268 MP default, over the 64 MP cap
    const bomb = oversizedPngHeader({ width: 9000, height: 9000 });
    expect(9000 * 9000).toBeGreaterThan(UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS);
    const refusal = await createImageThumbnail(bomb).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UploadThumbnailSourceError);
    expect(((refusal as Error).cause as Error).message).toMatch(/exceeds pixel limit/);
  });

  it('lets a large photo inside the cap through to the decoder (a 48 MP phone shot, 8064 × 6048)', async () => {
    expect(8064 * 6048).toBeLessThan(UPLOAD_THUMBNAIL_MAX_INPUT_PIXELS);
    const refusal = await createImageThumbnail(
      oversizedPngHeader({ width: 8064, height: 6048 }),
    ).catch((error: unknown) => error);
    // Its header passes the cap, so the decoder reads on and finds the image data empty
    expect(((refusal as Error).cause as Error).message).not.toMatch(/exceeds pixel limit/);
  });
});

describe('configureImageThumbnailDecoder', () => {
  it('turns the libvips cache off and decodes each image on one thread', () => {
    configureImageThumbnailDecoder();
    expect(sharp.concurrency()).toBe(1);
    const cache = sharp.cache();
    expect([cache.memory.max, cache.files.max, cache.items.max]).toEqual([0, 0, 0]);
  });
});
