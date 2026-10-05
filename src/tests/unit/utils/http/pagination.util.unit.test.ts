import { describe, expect, it } from 'vitest';
import { PAGINATION } from '@/shared/constants/index.js';
import {
  cursorPaginationSchema,
  decodeListCursor,
  encodeListCursor,
  parseListCursor,
} from '@/shared/utils/http/pagination.util.js';

describe('pagination.util', () => {
  describe('cursorPaginationSchema', () => {
    it('applies default limit and optional after cursor', () => {
      const result = cursorPaginationSchema.parse({});
      expect(result.limit).toBe(PAGINATION.DEFAULT_LIMIT);
      expect(result.after).toBeUndefined();
    });

    it('accepts after cursor string', () => {
      const result = cursorPaginationSchema.parse({ after: 'cursor-abc', limit: '10' });
      expect(result.after).toBe('cursor-abc');
      expect(result.limit).toBe(10);
    });

    it('rejects limit above MAX_LIMIT', () => {
      expect(() => cursorPaginationSchema.parse({ limit: PAGINATION.MAX_LIMIT + 1 })).toThrow();
    });
  });

  describe('encodeListCursor / decodeListCursor', () => {
    const payload = {
      created_at: '2026-10-05T10:00:00.000Z',
      public_id: 'org_9z3rura5kqvcv8zggriym',
      id: 4217,
      filter_fingerprint: 'a'.repeat(64),
    };

    it('round-trips a payload', () => {
      expect(decodeListCursor(encodeListCursor(payload))).toEqual(payload);
    });

    it('never carries the internal id in readable form', () => {
      const token = encodeListCursor(payload);
      const raw = Buffer.from(token, 'base64url').toString('latin1');
      expect(raw).not.toContain('4217');
      expect(raw).not.toContain('"id"');
      expect(raw).not.toContain('org_9z3rura5kqvcv8zggriym');
    });

    it('mints a different token each time for the same payload', () => {
      expect(encodeListCursor(payload)).not.toBe(encodeListCursor(payload));
    });

    it('decodes a cursor that was edited as nothing (first page)', () => {
      const bytes = Buffer.from(encodeListCursor(payload), 'base64url');
      bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 0xff;
      expect(decodeListCursor(bytes.toString('base64url'))).toBeNull();
    });

    it('decodes a readable (unencrypted) cursor as nothing — only minted cursors page', () => {
      const forged = Buffer.from(JSON.stringify(payload)).toString('base64url');
      expect(decodeListCursor(forged)).toBeNull();
      expect(parseListCursor(forged)).toBeNull();
    });

    it('fits the longest sort value under PAGINATION.MAX_CURSOR_LENGTH', () => {
      const token = encodeListCursor({ ...payload, sort_value: 'n'.repeat(255) });
      expect(token.length).toBeLessThanOrEqual(PAGINATION.MAX_CURSOR_LENGTH);
    });
  });
});
