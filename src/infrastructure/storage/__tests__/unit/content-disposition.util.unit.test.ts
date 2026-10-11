import { describe, expect, it } from 'vitest';
import { inlineContentDisposition } from '@/infrastructure/storage/content-disposition.util.js';

describe('inlineContentDisposition', () => {
  it('names a plain file in both parameters', () => {
    expect(inlineContentDisposition('cbc.pdf')).toBe(
      `inline; filename="cbc.pdf"; filename*=UTF-8''cbc.pdf`,
    );
  });

  it('keeps a non-ASCII name exact in filename* and falls back to underscores', () => {
    expect(inlineContentDisposition('रिपोर्ट.pdf')).toBe(
      `inline; filename="_______.pdf"; filename*=UTF-8''%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A5%8B%E0%A4%B0%E0%A5%8D%E0%A4%9F.pdf`,
    );
  });

  it('cannot be broken out of: quotes, backslashes and line breaks never reach the header', () => {
    const header = inlineContentDisposition('a"b\\c\r\nSet-Cookie: x=1.png');
    expect(header).toBe(
      `inline; filename="a_b_c__Set-Cookie: x=1.png"; filename*=UTF-8''a%22b%5Cc%0D%0ASet-Cookie%3A%20x%3D1.png`,
    );
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("percent-encodes the characters encodeURIComponent leaves alone in RFC 8187's value", () => {
    expect(inlineContentDisposition("Rohan's (final)*.jpg")).toContain(
      "filename*=UTF-8''Rohan%27s%20%28final%29%2A.jpg",
    );
  });
});
