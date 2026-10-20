import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import {
  buildContainsLikePattern,
  buildSearchCondition,
  computeListFilterFingerprint,
  finishKeysetPage,
  listSearchSortSchema,
  resolveKeysetSort,
  searchWords,
} from '@/shared/utils/http/list-query.util.js';
import { parseListCursor } from '@/shared/utils/http/pagination.util.js';

const SORT_FIELDS = ['name', 'created_at'] as const;
const schema = listSearchSortSchema(SORT_FIELDS);

type Row = {
  created_at: Date;
  cursor_created_at: string;
  id: number;
  name: string;
  public_id: string;
};
const row = (over: Partial<Row> = {}): Row => ({
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  cursor_created_at: '2026-01-01T00:00:00.000000Z',
  id: 1,
  name: 'alpha',
  public_id: 'role_a',
  ...over,
});

const columns = {
  name: { column: roles.name, kind: 'text' as const, getSortValue: (r: Row) => r.name },
  created_at: { column: roles.created_at, kind: 'created_at' as const },
};

describe('list-query.util', () => {
  describe('listSearchSortSchema', () => {
    it('parses q/sort/order; order is optional (defaulted to asc in resolveKeysetSort, not the schema)', () => {
      // No `.default` on order so OpenAPI emits it as an optional query param (a defaulted param
      // serializes as `required`, a breaking contract change).
      const parsed = schema.parse({ q: 'ann', sort: 'name' });
      expect(parsed).toMatchObject({ q: 'ann', sort: 'name' });
      expect('order' in parsed).toBe(false);
      expect(schema.parse({ q: 'ann', sort: 'name', order: 'desc' })).toMatchObject({
        order: 'desc',
      });
    });
    it('rejects an unknown sort value and unknown keys (strict)', () => {
      expect(schema.safeParse({ sort: 'email' }).success).toBe(false);
      expect(schema.safeParse({ bogus: 1 }).success).toBe(false);
    });
  });

  describe('buildContainsLikePattern', () => {
    it('wraps in %…% and escapes user wildcards', () => {
      expect(buildContainsLikePattern('ann')).toBe('%ann%');
      expect(buildContainsLikePattern('50%_off\\x')).toBe('%50\\%\\_off\\\\x%');
    });
  });

  describe('buildSearchCondition', () => {
    it('is undefined for empty q or no columns', () => {
      expect(buildSearchCondition({ columns: [roles.name], q: undefined })).toBeUndefined();
      expect(buildSearchCondition({ columns: [], q: 'x' })).toBeUndefined();
    });
    it('builds a condition when q + columns are present', () => {
      expect(buildSearchCondition({ columns: [roles.name], q: 'ann' })).toBeDefined();
    });
    it('keeps q as one phrase unless every word must match', () => {
      const dialect = new PgDialect();
      const phrase = buildSearchCondition({ columns: [roles.name], q: 'iyer  meera' });
      const words = buildSearchCondition({
        columns: [roles.name],
        q: ' iyer  meera ',
        everyWord: true,
      });
      expect(dialect.sqlToQuery(phrase as SQL).params).toEqual(['%iyer  meera%']);
      const everyWord = dialect.sqlToQuery(words as SQL);
      expect(everyWord.params).toEqual(['%iyer%', '%meera%']);
      expect(everyWord.sql).toMatch(/ilike .* and .* ilike/i);
    });
    it('is the same single condition for one word either way', () => {
      const dialect = new PgDialect();
      const one = buildSearchCondition({ columns: [roles.name], q: 'meera', everyWord: true });
      expect(dialect.sqlToQuery(one as SQL).params).toEqual(['%meera%']);
    });
  });

  describe('searchWords', () => {
    it('splits on any whitespace and drops empty words', () => {
      expect(searchWords('  Meera\t iyer  9825 ')).toEqual(['Meera', 'iyer', '9825']);
      expect(searchWords('   ')).toEqual([]);
    });
  });

  describe('computeListFilterFingerprint', () => {
    it('is stable and changes with q/sort/order', () => {
      const base = computeListFilterFingerprint({ q: undefined, sort: 'name', order: 'asc' });
      expect(base).toBe(computeListFilterFingerprint({ q: undefined, sort: 'name', order: 'asc' }));
      expect(base).not.toBe(computeListFilterFingerprint({ q: 'ann', sort: 'name', order: 'asc' }));
      expect(base).not.toBe(
        computeListFilterFingerprint({ q: undefined, sort: 'created_at', order: 'asc' }),
      );
      expect(base).not.toBe(
        computeListFilterFingerprint({ q: undefined, sort: 'name', order: 'desc' }),
      );
    });
  });

  describe('resolveKeysetSort', () => {
    it('applies the default sort when none is given and emits (col,id) orderBy', () => {
      const r = resolveKeysetSort<Row>({
        columns,
        idColumn: roles.id,
        defaultSort: 'created_at',
        sort: undefined,
        order: 'asc',
        after: undefined,
      });
      expect(r.sortField).toBe('created_at');
      expect(r.orderBy).toHaveLength(2);
      expect(r.cursorCondition).toBeUndefined(); // first page
      expect(r.sortValueFor(row())).toBeUndefined(); // created_at → no sort_value
    });

    it('extracts sort_value for text sorts', () => {
      const r = resolveKeysetSort<Row>({
        columns,
        idColumn: roles.id,
        defaultSort: 'name',
        sort: 'name',
        order: 'asc',
        after: undefined,
      });
      expect(r.sortValueFor(row({ name: 'zeta' }))).toBe('zeta');
    });

    it('ignores a cursor minted under a different sort/filter (resets to first page)', () => {
      // Mint a cursor under sort=name asc.
      const page = finishKeysetPage({
        rows: [row(), row({ id: 2, name: 'beta' })],
        args: {
          limit: 1,
          sortValueFor: (r) => r.name,
          filterFingerprint: computeListFilterFingerprint({
            q: undefined,
            sort: 'name',
            order: 'asc',
          }),
        },
      });
      const cursor = page.next_cursor!;
      expect(parseListCursor(cursor)?.sort_value).toBe('alpha');

      // Same sort → cursor honored (condition present).
      const same = resolveKeysetSort<Row>({
        columns,
        idColumn: roles.id,
        defaultSort: 'name',
        sort: 'name',
        order: 'asc',
        after: cursor,
      });
      expect(same.cursorCondition).toBeDefined();

      // Different sort → fingerprint mismatch → cursor ignored (first page).
      const changed = resolveKeysetSort<Row>({
        columns,
        idColumn: roles.id,
        defaultSort: 'created_at',
        sort: 'created_at',
        order: 'desc',
        after: cursor,
      });
      expect(changed.cursorCondition).toBeUndefined();
    });
  });

  describe('finishKeysetPage', () => {
    it('slices to limit, flags has_more, and mints a cursor carrying sort_value + fingerprint', () => {
      const fingerprint = computeListFilterFingerprint({ q: 'a', sort: 'name', order: 'asc' });
      const page = finishKeysetPage({
        rows: [row(), row({ id: 2, name: 'beta' })],
        args: {
          limit: 1,
          sortValueFor: (r) => r.name,
          filterFingerprint: fingerprint,
        },
      });
      expect(page.items).toHaveLength(1);
      expect(page.has_more).toBe(true);
      const decoded = parseListCursor(page.next_cursor!);
      expect(decoded?.sort_value).toBe('alpha');
      expect(decoded?.filter_fingerprint).toBe(fingerprint);
    });

    it('pages a plain (created_at, id) list: total passed through, cursor without sort or filter', () => {
      // The page builder every keyset list uses — the plain lists pass only the limit and a total.
      const page = finishKeysetPage({
        rows: [row(), row({ id: 2 }), row({ id: 3 })],
        args: {
          limit: 2,
          total: 3,
        },
      });

      expect(page).toMatchObject({ limit: 2, total: 3, has_more: true });
      expect(page.items.map((item) => item.id)).toEqual([1, 2]);
      const decoded = parseListCursor(page.next_cursor!);
      expect(decoded).toMatchObject({ id: 2, public_id: 'role_a' });
      expect(decoded?.sort_value).toBeUndefined();
      expect(decoded?.filter_fingerprint).toBeUndefined();
      expect(finishKeysetPage({ rows: [row()], args: { limit: 2 } }).total).toBeNull();
    });

    // A last page that is exactly full: the `limit + 1` fetch got `limit` rows, so there is no
    // next page (planted-bug drill A2-5, 20 Oct 2026: `>=` reported one, with a cursor).
    it('reports no next page when the fetch returns exactly limit rows', () => {
      const page = finishKeysetPage({
        rows: [row(), row({ id: 2 })],
        args: { limit: 2 },
      });
      expect(page.items).toHaveLength(2);
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });

    it('returns no cursor when there is no next page', () => {
      const page = finishKeysetPage({
        rows: [row()],
        args: {
          limit: 5,
          sortValueFor: () => undefined,
          filterFingerprint: 'x',
        },
      });
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });
  });
});
