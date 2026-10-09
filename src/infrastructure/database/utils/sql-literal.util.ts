import { type SQL, sql } from 'drizzle-orm';

/** A constant as SQL source: a number as itself, text quoted with its single quotes doubled. */
function literalSource(value: string | number): string {
  return typeof value === 'number' ? value.toString() : `'${value.replaceAll("'", "''")}'`;
}

/**
 * A constant as a SQL literal (`'value'`, or a bare number) — for a schema's CHECK constraints
 * and partial-index predicates, where the value is part of the DDL, never a bound parameter.
 *
 * @remarks
 * - **Algorithm:** a number is emitted as written; text is wrapped in single quotes with any quote
 *   inside doubled; the result is emitted raw. Only for the code's own constants (statuses, regex
 *   patterns, limits) — never for input.
 * - **Failure modes:** none.
 */
export function sqlLiteral(value: string | number): SQL {
  return sql.raw(literalSource(value));
}

/**
 * A list of constants as SQL literals (`'a', 'b', …`) — the inside of a CHECK's `IN (…)`.
 *
 * @remarks
 * - **Algorithm:** each value written as {@link sqlLiteral} writes it, joined with `, `, emitted
 *   raw.
 * - **Failure modes:** none — an empty list emits nothing (an `IN ()` is invalid SQL, so callers
 *   pass a non-empty constant list).
 */
export function sqlLiteralList(values: readonly (string | number)[]): SQL {
  return sql.raw(values.map(literalSource).join(', '));
}
