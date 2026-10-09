/** A JPEG starts with Start Of Image. */
const JPEG_START_OF_IMAGE = 0xd8;
/** The marker after which the compressed image data follows — copied as it is. */
const JPEG_START_OF_SCAN = 0xda;
/** The APP1 marker — EXIF and XMP live in it. */
const JPEG_APP1 = 0xe1;

/** EXIF's APP1 header (`Exif\0\0`). */
const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');
/** XMP's APP1 namespaces — the packet and its extension; XMP may carry the location again. */
const XMP_HEADERS = [
  Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
  Buffer.from('http://ns.adobe.com/xmp/extension/\0', 'latin1'),
];

/** The IFD0 tag that points at the GPS IFD. */
const TIFF_GPS_INFO_TAG = 0x8825;
/** Bytes per IFD entry. */
const TIFF_ENTRY_SIZE = 12;
/** Bytes per value of each TIFF type (1 BYTE … 12 DOUBLE). */
const TIFF_TYPE_SIZES: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

/** PNG's eight-byte signature. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The PNG text chunks that may carry an XMP packet. */
const PNG_TEXT_CHUNKS = new Set(['iTXt', 'tEXt', 'zTXt']);
/** The keyword of an XMP text chunk. */
const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp';

/** What {@link removeImageLocation} did. */
export interface ImageLocationRemoval {
  body: Buffer;
  /** Whether anything was removed — when false, `body` is the input itself. */
  changed: boolean;
}

/** A TIFF reader over an EXIF block in either byte order. */
function tiffReader(tiff: Buffer): {
  u16: (offset: number) => number;
  u32: (offset: number) => number;
} | null {
  if (tiff.length < 8) return null;
  const order = tiff.toString('latin1', 0, 2);
  if (order === 'II') {
    return {
      u16: (offset) => tiff.readUInt16LE(offset),
      u32: (offset) => tiff.readUInt32LE(offset),
    };
  }
  if (order === 'MM') {
    return {
      u16: (offset) => tiff.readUInt16BE(offset),
      u32: (offset) => tiff.readUInt32BE(offset),
    };
  }
  return null;
}

/** A TIFF reader over an EXIF block. */
type TiffReader = NonNullable<ReturnType<typeof tiffReader>>;

/** The offset of the GPS IFD IFD0 points at, or `null` when there is none (or it is out of range). */
function findGpsDirectory(tiff: Buffer, read: TiffReader): number | null {
  const firstDirectory = read.u32(4);
  if (firstDirectory + 2 > tiff.length) return null;
  const entryCount = read.u16(firstDirectory);
  for (let index = 0; index < entryCount; index += 1) {
    const entry = firstDirectory + 2 + index * TIFF_ENTRY_SIZE;
    if (entry + TIFF_ENTRY_SIZE > tiff.length) return null;
    if (read.u16(entry) === TIFF_GPS_INFO_TAG) {
      const gpsDirectory = read.u32(entry + 8);
      return gpsDirectory + 2 > tiff.length ? null : gpsDirectory;
    }
  }
  return null;
}

/** Zeroes one GPS entry and the value it points at (a value over four bytes lives elsewhere). */
function clearGpsEntry(tiff: Buffer, read: TiffReader, entry: number): void {
  const size = (TIFF_TYPE_SIZES[read.u16(entry + 2)] ?? 1) * read.u32(entry + 4);
  if (size > 4) {
    const valueAt = read.u32(entry + 8);
    if (valueAt + size <= tiff.length) tiff.fill(0, valueAt, valueAt + size);
  }
  tiff.fill(0, entry, entry + TIFF_ENTRY_SIZE);
}

/**
 * Empties the GPS IFD of a TIFF block in place — its entry count set to 0 and every byte of its
 * entries and their values zeroed; the rest (orientation, capture time) is untouched. Answers
 * whether it found a GPS IFD.
 */
function emptyGpsDirectory(tiff: Buffer): boolean {
  const read = tiffReader(tiff);
  const gpsDirectory = read ? findGpsDirectory(tiff, read) : null;
  if (!read || gpsDirectory === null) return false;
  const gpsCount = read.u16(gpsDirectory);
  for (let index = 0; index < gpsCount; index += 1) {
    const entry = gpsDirectory + 2 + index * TIFF_ENTRY_SIZE;
    if (entry + TIFF_ENTRY_SIZE > tiff.length) break;
    clearGpsEntry(tiff, read, entry);
  }
  tiff.fill(0, gpsDirectory, gpsDirectory + 2);
  return true;
}

/** What a JPEG segment is to the location removal. */
function segmentKind(marker: number, payload: Buffer): 'xmp' | 'exif' | 'other' {
  if (marker !== JPEG_APP1) return 'other';
  if (XMP_HEADERS.some((header) => payload.subarray(0, header.length).equals(header))) return 'xmp';
  return payload.subarray(0, EXIF_HEADER.length).equals(EXIF_HEADER) ? 'exif' : 'other';
}

/** JPEG: each APP1 segment's EXIF GPS block emptied, XMP segments dropped. */
function removeJpegLocation(image: Buffer): ImageLocationRemoval {
  if (image.length < 4 || image[0] !== 0xff || image[1] !== JPEG_START_OF_IMAGE) {
    return { body: image, changed: false };
  }
  const parts: Buffer[] = [image.subarray(0, 2)];
  let changed = false;
  let offset = 2;
  while (offset + 4 <= image.length && image[offset] === 0xff) {
    const marker = image[offset + 1] ?? 0;
    const length = image.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (marker === JPEG_START_OF_SCAN || length < 2 || end > image.length) break;
    const segment = Buffer.from(image.subarray(offset, end));
    const kind = segmentKind(marker, segment.subarray(4));
    if (kind === 'exif')
      changed = emptyGpsDirectory(segment.subarray(4 + EXIF_HEADER.length)) || changed;
    if (kind === 'xmp') changed = true;
    else parts.push(segment);
    offset = end;
  }
  if (!changed) return { body: image, changed: false };
  parts.push(image.subarray(offset));
  return { body: Buffer.concat(parts), changed: true };
}

/** Whether a PNG chunk carries location: `eXIf`, or a text chunk holding XMP. */
function isPngLocationChunk(type: string, data: Buffer): boolean {
  if (type === 'eXIf') return true;
  return (
    PNG_TEXT_CHUNKS.has(type) &&
    data.toString('latin1', 0, PNG_XMP_KEYWORD.length + 1) === `${PNG_XMP_KEYWORD}\0`
  );
}

/** PNG: its `eXIf` chunk and XMP text chunks dropped. */
function removePngLocation(image: Buffer): ImageLocationRemoval {
  if (image.length < PNG_SIGNATURE.length || !image.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { body: image, changed: false };
  }
  const parts: Buffer[] = [image.subarray(0, 8)];
  let changed = false;
  let offset = 8;
  while (offset + 12 <= image.length) {
    const length = image.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > image.length) break;
    const type = image.toString('latin1', offset + 4, offset + 8);
    if (isPngLocationChunk(type, image.subarray(offset + 8, offset + 8 + length))) {
      changed = true;
    } else {
      parts.push(image.subarray(offset, end));
    }
    offset = end;
  }
  if (!changed) return { body: image, changed: false };
  parts.push(image.subarray(offset));
  return { body: Buffer.concat(parts), changed: true };
}

/**
 * A photo without where it was taken (launch D79, WC-42) — the clinic files patient photos, and a
 * phone's photo carries the patient's home or the clinic's GPS position.
 *
 * @remarks
 * - **Algorithm:** JPEG — walks the segments up to the image data: each EXIF APP1 keeps its tags
 *   but its GPS IFD is emptied in place (entry count 0, entries and values zeroed), so the
 *   orientation and the capture time stay (the photos keep their order); XMP APP1 segments, which
 *   can repeat the location, are dropped. PNG — the `eXIf` chunk and XMP text chunks are dropped.
 *   Anything else, or a file that does not parse, comes back as it is.
 * - **Failure modes:** none — a truncated or odd file is returned unchanged, never thrown on.
 * - **Notes:** a pure buffer function; the caller reads and writes the stored object.
 */
export function removeImageLocation(image: Buffer, mimeType: string): ImageLocationRemoval {
  if (mimeType === 'image/jpeg') return removeJpegLocation(image);
  if (mimeType === 'image/png') return removePngLocation(image);
  return { body: image, changed: false };
}
