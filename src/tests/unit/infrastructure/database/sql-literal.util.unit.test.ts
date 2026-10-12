import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';

const dialect = new PgDialect();

/** The SQL text a fragment renders to (and the parameters it would bind — none for a literal). */
function render(fragment: ReturnType<typeof sql>): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(fragment);
}

describe('sql-literal.util', () => {
  it('quotes text and binds no parameter', () => {
    expect(render(sql`status = ${sqlLiteral('open')}`)).toEqual({
      sql: "status = 'open'",
      params: [],
    });
  });

  it('doubles a quote inside the text', () => {
    expect(render(sqlLiteral("it's")).sql).toBe("'it''s'");
  });

  it('writes a number bare', () => {
    expect(render(sqlLiteral(5)).sql).toBe('5');
  });

  it('keeps a regex pattern byte for byte', () => {
    expect(render(sqlLiteral('^\\+91\\d{10}$')).sql).toBe("'^\\+91\\d{10}$'");
  });

  it('lists values for an IN check, text quoted and numbers bare', () => {
    expect(render(sql`kind IN (${sqlLiteralList(['a', 'b', 3])})`).sql).toBe(
      "kind IN ('a', 'b', 3)",
    );
  });
});
