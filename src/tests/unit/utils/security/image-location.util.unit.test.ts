import { describe, expect, it } from 'vitest';
import { removeImageLocation } from '@/shared/utils/security/image-location.util.js';

/** A JPEG segment: marker, big-endian length, payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/**
 * A little-endian EXIF block: IFD0 (at 8) with the orientation (6) and a GPS pointer; the GPS IFD
 * (at 38) with `N` and a latitude of 21° 10′ 12″ — three rationals stored at 68.
 */
function exifWithGps(): Buffer {
  const tiff = Buffer.alloc(92);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10); // Orientation, SHORT × 1 = 6 (inline)
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(6, 18);
  tiff.writeUInt16LE(0x8825, 22); // GPSInfo, LONG × 1 → 38
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 30);
  tiff.writeUInt16LE(2, 38);
  tiff.writeUInt16LE(0x0001, 40); // GPSLatitudeRef, ASCII × 2 = "N\0" (inline)
  tiff.writeUInt16LE(2, 42);
  tiff.writeUInt32LE(2, 44);
  tiff.write('N\0', 48, 'latin1');
  tiff.writeUInt16LE(0x0002, 52); // GPSLatitude, RATIONAL × 3 → 68
  tiff.writeUInt16LE(5, 54);
  tiff.writeUInt32LE(3, 56);
  tiff.writeUInt32LE(68, 60);
  for (const [index, value] of [21, 10, 12].entries()) {
    tiff.writeUInt32LE(value, 68 + index * 8);
    tiff.writeUInt32LE(1, 72 + index * 8);
  }
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
}

const XMP = Buffer.concat([
  Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
  Buffer.from('<x:xmpmeta><exif:GPSLatitude>21,10.2N</exif:GPSLatitude></x:xmpmeta>', 'latin1'),
]);
const SCAN = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
const START = Buffer.from([0xff, 0xd8]);

/** A PNG chunk: length, type, data, a placeholder CRC. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4, 0xab)]);
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A patient photo without where it was taken (launch D79, WC-42). */
describe('removeImageLocation', () => {
  it('JPEG: empties the GPS IFD in place, keeps the orientation, drops XMP, keeps the image data', () => {
    const exif = exifWithGps();
    const image = Buffer.concat([START, segment(0xe1, exif), segment(0xe1, XMP), SCAN]);

    const { body, changed } = removeImageLocation(image, 'image/jpeg');

    expect(changed).toBe(true);
    expect(body.includes(Buffer.from('ns.adobe.com/xap', 'latin1'))).toBe(false);
    expect(body.subarray(body.length - SCAN.length).equals(SCAN)).toBe(true);
    // SOI (2) + the APP1 marker and length (4) + "Exif\0\0" (6)
    const tiff = body.subarray(12, 12 + exif.length - 6);
    expect(tiff.readUInt16LE(18)).toBe(6); // the orientation stays
    expect(tiff.readUInt32LE(30)).toBe(38); // the pointer stays, to an empty IFD
    expect(tiff.readUInt16LE(38)).toBe(0); // no GPS entries
    expect(tiff.subarray(40, 64).every((byte) => byte === 0)).toBe(true);
    expect(tiff.subarray(68, 92).every((byte) => byte === 0)).toBe(true); // the latitude is gone
  });

  it('JPEG without a location: the same buffer back, unchanged', () => {
    const image = Buffer.concat([START, segment(0xe0, Buffer.from('JFIF\0', 'latin1')), SCAN]);

    const result = removeImageLocation(image, 'image/jpeg');

    expect(result.changed).toBe(false);
    expect(result.body).toBe(image);
  });

  it('PNG: drops eXIf and the XMP text chunk, keeps every other chunk', () => {
    const header = chunk('IHDR', Buffer.alloc(13, 1));
    const data = chunk('IDAT', Buffer.from([1, 2, 3]));
    const end = chunk('IEND', Buffer.alloc(0));
    const comment = chunk('tEXt', Buffer.from('Comment\0taken at the clinic', 'latin1'));
    const image = Buffer.concat([
      PNG_SIGNATURE,
      header,
      chunk('eXIf', exifWithGps().subarray(6)),
      chunk('iTXt', Buffer.from('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>', 'latin1')),
      comment,
      data,
      end,
    ]);

    const { body, changed } = removeImageLocation(image, 'image/png');

    expect(changed).toBe(true);
    expect(body.equals(Buffer.concat([PNG_SIGNATURE, header, comment, data, end]))).toBe(true);
  });

  it('other types, and files that do not parse, come back as they are', () => {
    const webp = Buffer.from('RIFF....WEBP', 'latin1');
    expect(removeImageLocation(webp, 'image/webp')).toEqual({ body: webp, changed: false });
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00]);
    expect(removeImageLocation(truncated, 'image/jpeg')).toEqual({
      body: truncated,
      changed: false,
    });
    const notPng = Buffer.from('not a png at all', 'latin1');
    expect(removeImageLocation(notPng, 'image/png').changed).toBe(false);
  });
});
