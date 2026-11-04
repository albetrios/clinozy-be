import { crc32, deflateSync } from 'node:zlib';

/** One PNG chunk: its length, type, data and CRC. */
function pngChunk({ type, data }: { type: string; data: Buffer }): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

/**
 * A few dozen bytes of interlaced PNG that claim `width` × `height` RGB pixels of `bitDepth` bits a
 * sample (8 by default) and carry none — the shape of a decompression bomb, for tests of a
 * decoder's pixel and decoded-size caps.
 *
 * @remarks
 * - **Notes:** a decoder that checks the header's dimensions refuses it before decoding; one that
 *   does not goes on to read the (empty) image data. Building a real image that size would take
 *   hundreds of megabytes.
 */
export function oversizedPngHeader({
  width,
  height,
  bitDepth = 8,
}: {
  width: number;
  height: number;
  bitDepth?: 8 | 16;
}): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = 2; // colour type: RGB
  header[12] = 1; // Adam7 interlace: decoded whole before any resize
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk({ type: 'IHDR', data: header }),
    pngChunk({ type: 'IDAT', data: deflateSync(Buffer.alloc(0)) }),
    pngChunk({ type: 'IEND', data: Buffer.alloc(0) }),
  ]);
}
