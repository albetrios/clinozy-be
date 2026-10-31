/**
 * Central recursive, case-insensitive secret redactor.
 *
 * Walks arbitrary objects/arrays and replaces the value of any key whose name contains a
 * sensitive fragment (case-insensitive substring) with `[REDACTED]`. Used by the Pino logger
 * and Sentry `beforeSend` so headers, query, body, breadcrumbs, and extras are scrubbed
 * regardless of nesting depth or header casing.
 *
 * String values that look like URLs or query strings have sensitive parameter values scrubbed.
 * A database failure (Drizzle's `Failed query: … params: …`, a node-postgres `DatabaseError` and
 * its row `detail`) is reduced to `{ name, code, constraint, table }` ({@link sanitizeDatabaseError}).
 * Returns a redacted deep copy — never mutates the input. Cyclic references are tracked via
 * WeakMap so the original object graph is never returned from a cycle or depth boundary.
 */
export const SENSITIVE_REDACTION_PLACEHOLDER = '[REDACTED]';

const MAX_REDACTION_DEPTH = 8;

/**
 * Lower-cased substrings that mark a key as sensitive. Substring (not exact) matching catches
 * casing and nesting variants: `Authorization`, `X-Api-Key`, `set-cookie`, `raw_key`,
 * `body.refresh_token`, etc. `email` is included to keep address PII out of logs and Sentry;
 * this also redacts incidental flags such as `is_email_verified`, which is an acceptable
 * fail-closed trade-off.
 */
export const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'password',
  'passwd',
  'secret',
  'token',
  'cookie',
  'api_key',
  'apikey',
  'api-key',
  'raw_key',
  'rawkey',
  'access_key_id',
  'private_key',
  'encryption_key',
  'session_id',
  'jwt',
  'credential',
  'email',
] as const;

interface RedactionContext {
  readonly visited: WeakMap<object, Record<string, unknown> | unknown[] | Error>;
  readonly depth: number;
}

/** Returns true when `key` (case-insensitive) contains any fragment in {@link SENSITIVE_KEY_FRAGMENTS} (e.g. `Authorization`, `X-Api-Key`, `set-cookie`). */
export function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.includes('://');
}

function looksLikeQueryString(value: string): boolean {
  if (!value.includes('=')) {
    return false;
  }
  const queryPortion = value.startsWith('?') ? value.slice(1) : value;
  return queryPortion.split('&').some((pair) => pair.includes('='));
}

function decodeQueryParameterName(parameterName: string): string {
  try {
    return decodeURIComponent(parameterName.replace(/\+/g, ' '));
  } catch {
    return parameterName;
  }
}

/**
 * Redacts sensitive query parameter values in an application/x-www-form-urlencoded string.
 */
export function redactSensitiveQueryString(query: string): string {
  const hasLeadingQuestionMark = query.startsWith('?');
  const queryPortion = hasLeadingQuestionMark ? query.slice(1) : query;
  if (!queryPortion.includes('=')) {
    return query;
  }

  let changed = false;
  const redactedPairs = queryPortion.split('&').map((pair) => {
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) {
      return pair;
    }

    const parameterName = pair.slice(0, equalsIndex);
    if (!isSensitiveKey(decodeQueryParameterName(parameterName))) {
      return pair;
    }

    changed = true;
    return `${parameterName}=${SENSITIVE_REDACTION_PLACEHOLDER}`;
  });

  if (!changed) {
    return query;
  }

  const redactedQuery = redactedPairs.join('&');
  return hasLeadingQuestionMark ? `?${redactedQuery}` : redactedQuery;
}

/**
 * Redacts sensitive query parameter values in a full URL string.
 */
export function redactSensitiveUrl(url: string): string {
  if (!looksLikeUrl(url)) {
    const questionMarkIndex = url.indexOf('?');
    if (questionMarkIndex === -1) {
      return url;
    }
    // `slice(questionMarkIndex)` keeps the `?`, and redactSensitiveQueryString
    // puts it back on the way out — including it in the prefix too emitted `??`.
    return `${url.slice(0, questionMarkIndex)}${redactSensitiveQueryString(url.slice(questionMarkIndex))}`;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.search) {
      const redactedSearch = redactSensitiveQueryString(parsedUrl.search);
      return `${parsedUrl.origin}${parsedUrl.pathname}${redactedSearch}${parsedUrl.hash}`;
    }
    return parsedUrl.toString();
  } catch {
    const questionMarkIndex = url.indexOf('?');
    if (questionMarkIndex === -1) {
      return url;
    }
    // `slice(questionMarkIndex)` keeps the `?`, and redactSensitiveQueryString
    // puts it back on the way out — including it in the prefix too emitted `??`.
    return `${url.slice(0, questionMarkIndex)}${redactSensitiveQueryString(url.slice(questionMarkIndex))}`;
  }
}

/** Name of the error {@link sanitizeDatabaseError} returns in place of a database failure. */
export const DATABASE_QUERY_ERROR_NAME = 'DatabaseQueryError';

/** What a database failure says once its query, bound values and row detail are withheld. */
const DATABASE_QUERY_FAILED_MESSAGE = 'Database query failed';

/** Opens Drizzle's `DrizzleQueryError` message — `Failed query: <sql>\nparams: <bound values>`. */
const DRIZZLE_FAILED_QUERY_PREFIX = 'Failed query: ';

/**
 * Index of the first stack frame line (`\n`, whitespace, `at `) at or after `from`, or
 * `value.length` when none follows.
 *
 * @remarks
 * A single forward pass: a whitespace run that does not end in `at ` is skipped whole, so no
 * character is examined more than twice whatever the input (a regex lookahead here backtracked
 * super-linearly — SonarQube S5852).
 */
function indexOfNextStackFrame({ value, from }: { value: string; from: number }): number {
  let index = value.indexOf('\n', from);
  while (index !== -1) {
    let afterWhitespace = index + 1;
    while (afterWhitespace < value.length && /\s/.test(value.charAt(afterWhitespace))) {
      afterWhitespace += 1;
    }
    if (afterWhitespace > index + 1 && value.startsWith('at ', afterWhitespace)) return index;
    index = value.indexOf('\n', Math.max(afterWhitespace, index + 1));
  }
  return value.length;
}

/**
 * Replaces any Drizzle `Failed query: … params: …` text inside `value` (an error message, a stack,
 * a log line) with {@link DATABASE_QUERY_FAILED_MESSAGE} — from `Failed query: ` up to the first
 * stack frame or the end of the string. A Sentry value cut short before `params:` is still
 * replaced, so no part of the statement or its values survives.
 */
function redactDatabaseQueryErrorText(value: string): string {
  let start = value.indexOf(DRIZZLE_FAILED_QUERY_PREFIX);
  if (start === -1) return value;
  let redacted = '';
  let cursor = 0;
  while (start !== -1) {
    redacted += `${value.slice(cursor, start)}${DATABASE_QUERY_FAILED_MESSAGE}`;
    cursor = indexOfNextStackFrame({ value, from: start + DRIZZLE_FAILED_QUERY_PREFIX.length });
    start = value.indexOf(DRIZZLE_FAILED_QUERY_PREFIX, cursor);
  }
  return `${redacted}${value.slice(cursor)}`;
}

/**
 * True for Drizzle's `DrizzleQueryError` — the wrapper whose message, `query` and `params` carry the
 * statement and every bound value. Duck-typed (own `query` + `params`, the `Failed query:` message)
 * so a second copy of `drizzle-orm` in the tree is still recognised.
 */
function isDrizzleQueryError(value: Error): boolean {
  const candidate = value as Error & { query?: unknown };
  return (
    typeof candidate.query === 'string' &&
    Object.hasOwn(candidate, 'params') &&
    candidate.message.startsWith('Failed query: ')
  );
}

/** node-postgres's `DatabaseError`, as far as {@link sanitizeDatabaseError} reads it. */
type PostgresServerError = Error & { code: string; constraint?: unknown; table?: unknown };

/**
 * True for node-postgres's `DatabaseError` — a server-side failure: a five-character SQLSTATE `code`
 * plus a `severity`. Its `detail` quotes key values or the whole failing row, and its message can
 * quote an input value (`22P02`, `22003`).
 */
function isPostgresServerError(value: unknown): value is PostgresServerError {
  if (!(value instanceof Error)) return false;
  const { code, severity } = value as Error & { code?: unknown; severity?: unknown };
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && typeof severity === 'string';
}

/** The stack frames of `error` (its `name: message` header removed), or `undefined`. */
function stackFramesOf(error: Error): string | undefined {
  if (typeof error.stack !== 'string') return undefined;
  const header = `${error.name}: ${error.message}`;
  return error.stack.startsWith(header) ? error.stack.slice(header.length) : undefined;
}

/**
 * Replaces a database failure — Drizzle's `DrizzleQueryError` or node-postgres's `DatabaseError` —
 * with an error that names only what failed: `{ name, code, constraint, table }`. Anything else is
 * returned unchanged.
 *
 * @remarks
 * - **Algorithm:** finds the Postgres server error (the input, or a Drizzle wrapper's `cause`) and
 *   copies its SQLSTATE `code`, `constraint` and `table` onto a new `DatabaseQueryError` whose
 *   message is `Database query failed (SQLSTATE …, constraint …, table …)`. The original stack
 *   frames are kept (they are file paths); the header line that quoted the statement is rewritten.
 *   A Drizzle wrapper around a client-side failure (a dropped connection, a read timeout) keeps
 *   that failure as its `cause` and names it in the message — it carries no bound value, and
 *   `isTransientConnectionError` still reads it.
 * - **Failure modes:** none.
 * - **Side effects:** none — returns a new error; the input is not touched.
 * - **Notes:** C-1 — Drizzle 0.45 throws `Failed query: <sql>\nparams: <values>` and keeps
 *   `query` / `params` on the error; the driver error's `detail` quotes key values or the whole
 *   failing row (a patient's name, phone, notes). Key-based redaction cannot see a value, so every
 *   place an error leaves the process — the logger, Sentry, the dead-letter ledger — goes through
 *   this. `code`, `constraint` and `table` stay so `postgres-error.util.ts` keeps classifying it.
 */
export function sanitizeDatabaseError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const failure = findDatabaseFailure(error);
  if (failure === undefined) return error;
  const fields = databaseErrorFieldsOf(failure.serverError);
  const message = describeDatabaseFailure({ fields, clientFailure: failure.clientFailure });
  return buildDatabaseQueryError({
    original: error,
    message,
    fields,
    clientFailure: failure.clientFailure,
  });
}

/** What {@link sanitizeDatabaseError} keeps of a Postgres server error. */
type DatabaseErrorFields = { code?: string; constraint?: string; table?: string };

/** A database failure: the Postgres server error, or else the client-side failure behind it. */
type DatabaseFailure = {
  serverError: PostgresServerError | undefined;
  clientFailure: Error | undefined;
};

/**
 * The database failure behind `error`: the Postgres server error (the input, or a Drizzle wrapper's
 * `cause`), or the client-side failure a Drizzle wrapper carries. `undefined` for any other error.
 */
function findDatabaseFailure(error: Error): DatabaseFailure | undefined {
  const drizzleQueryError = isDrizzleQueryError(error);
  if (!(drizzleQueryError || isPostgresServerError(error))) return undefined;
  const cause = drizzleQueryError ? error.cause : error;
  const serverError = isPostgresServerError(cause) ? cause : undefined;
  const clientFailure = serverError === undefined && cause instanceof Error ? cause : undefined;
  return { serverError, clientFailure };
}

/** The SQLSTATE `code`, `constraint` and `table` of `serverError` — the only fields kept. */
function databaseErrorFieldsOf(serverError: PostgresServerError | undefined): DatabaseErrorFields {
  const fields: DatabaseErrorFields = {};
  if (serverError === undefined) return fields;
  fields.code = serverError.code;
  if (typeof serverError.constraint === 'string') fields.constraint = serverError.constraint;
  if (typeof serverError.table === 'string') fields.table = serverError.table;
  return fields;
}

/** `Database query failed (SQLSTATE …, constraint …, table …)`, or `…: <client failure>`. */
function describeDatabaseFailure({
  fields,
  clientFailure,
}: {
  fields: DatabaseErrorFields;
  clientFailure: Error | undefined;
}): string {
  const described = [
    fields.code ? `SQLSTATE ${fields.code}` : undefined,
    fields.constraint ? `constraint ${fields.constraint}` : undefined,
    fields.table ? `table ${fields.table}` : undefined,
  ].filter((part) => part !== undefined);
  if (described.length > 0) return `${DATABASE_QUERY_FAILED_MESSAGE} (${described.join(', ')})`;
  if (clientFailure) return `${DATABASE_QUERY_FAILED_MESSAGE}: ${clientFailure.message}`;
  return DATABASE_QUERY_FAILED_MESSAGE;
}

/** Defines `key` on `target` the way an `Error`'s own `name` / `cause` is: non-enumerable. */
function defineNonEnumerable({
  target,
  key,
  value,
}: {
  target: Error;
  key: 'name' | 'cause';
  value: unknown;
}): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * The new `DatabaseQueryError`: `message`, the kept `fields`, the client failure as `cause`, and
 * `original`'s stack frames under a rewritten header line.
 */
function buildDatabaseQueryError({
  original,
  message,
  fields,
  clientFailure,
}: {
  original: Error;
  message: string;
  fields: DatabaseErrorFields;
  clientFailure: Error | undefined;
}): Error {
  const sanitized = new Error(message);
  defineNonEnumerable({ target: sanitized, key: 'name', value: DATABASE_QUERY_ERROR_NAME });
  Object.assign(sanitized, fields);
  if (clientFailure) defineNonEnumerable({ target: sanitized, key: 'cause', value: clientFailure });
  const frames = stackFramesOf(original);
  if (frames === undefined) {
    delete (sanitized as { stack?: string }).stack;
  } else {
    sanitized.stack = `${DATABASE_QUERY_ERROR_NAME}: ${message}${frames}`;
  }
  return sanitized;
}

/**
 * Each database failure on `error`'s `cause` chain, as its original message and the message
 * {@link sanitizeDatabaseError} gives it — for surfaces that copied the message out as text before
 * the error could be sanitized (a Sentry event's `exception.values`).
 */
export function listDatabaseErrorMessages(
  error: unknown,
): { message: string; sanitizedMessage: string }[] {
  const messages: { message: string; sanitizedMessage: string }[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_REDACTION_DEPTH && current instanceof Error; depth += 1) {
    const sanitized = sanitizeDatabaseError(current);
    if (sanitized !== current) {
      messages.push({ message: current.message, sanitizedMessage: (sanitized as Error).message });
    }
    current = current.cause;
  }
  return messages;
}

function redactSensitiveString(input: string): string {
  const value = redactDatabaseQueryErrorText(input);
  if (looksLikeUrl(value)) {
    return redactSensitiveUrl(value);
  }
  if (looksLikeQueryString(value)) {
    return redactSensitiveQueryString(value);
  }
  return value;
}

/**
 * Errors carry `name` / `message` / `stack` as NON-enumerable properties, so the
 * `Object.entries` walk below copied none of them and every error collapsed to
 * `{}`. Pino runs `formatters.log` BEFORE its serializers, so the
 * `stdSerializers.err` wired into the logger never saw an `Error` at all — it was
 * handed that empty copy and passed it straight through. Every
 * `logger.error({ error }, …)` in the codebase lost its message and stack that way.
 *
 * The copy stays a real `Error` rather than becoming a plain `{ type, message,
 * stack }` object, so the serializers downstream — this logger's, and the one
 * Fastify installs by default — get what they are built for and render it the way
 * they always have. Handing them a pre-shaped plain object instead makes pino
 * re-serialize it: `type` comes back as `Object` and the stack is rebuilt from
 * fields it no longer recognises.
 *
 * Message and stack go through {@link redactSensitiveString} like any other string
 * — a token in a failing URL must not reach the log just because it arrived inside
 * an Error.
 */
function redactError({ input, context }: { input: Error; context: RedactionContext }): Error {
  const existingError = context.visited.get(input);
  if (existingError !== undefined) {
    return existingError as Error;
  }
  // C-1: a database failure is first reduced to what failed — no statement, values or row detail.
  const sanitizedDatabaseError = sanitizeDatabaseError(input);
  if (sanitizedDatabaseError !== input) {
    const redactedDatabaseError = redactError({
      input: sanitizedDatabaseError as Error,
      context,
    });
    context.visited.set(input, redactedDatabaseError);
    return redactedDatabaseError;
  }

  const redactedMessage = redactSensitiveString(input.message);
  const output = new Error(redactedMessage);
  context.visited.set(input, output);

  // `name` and `cause` are non-enumerable on a real Error. Assigning them
  // plainly would make them own ENUMERABLE properties, and pino copies those
  // verbatim — the log would carry a redundant `name` beside `type`, and a
  // `cause` beside the one the serializer already folds into message + stack.
  Object.defineProperty(output, 'name', {
    value: input.name,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  if (input.cause !== undefined) {
    Object.defineProperty(output, 'cause', {
      value: redactValue({ input: input.cause, context: { ...context, depth: context.depth + 1 } }),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  /**
   * Only the stack's header line can hold the secret, because it is
   * `${name}: ${message}` — the frames below it are file paths. Swapping just
   * that substring keeps every frame intact. Running the WHOLE stack through
   * {@link redactSensitiveString} instead destroys it: a stack quoting a URL
   * contains `://`, so it is taken for a URL, and `new URL` parses the header
   * line as scheme `error:` rather than throwing — the "redacted" result is
   * `null <rest of first line>` with every frame dropped. Replacement goes
   * through a function so a `$&` in the message is not read as a backreference.
   */
  if (typeof input.stack === 'string') {
    output.stack =
      redactedMessage === input.message
        ? input.stack
        : input.stack.replace(input.message, () => redactedMessage);
  } else {
    // The source had no stack, and `new Error()` just gave the copy one pointing
    // into this file — worse than none, since it describes the redactor rather
    // than the failure.
    delete (output as { stack?: string }).stack;
  }

  // Own enumerable extras an error may carry (`code`, `statusCode`, …) are
  // redacted by key like any other object.
  const extras = output as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(input as unknown as Record<string, unknown>)) {
    // eslint-disable-next-line security/detect-object-injection -- key from Object.entries of the error being redacted; written to a fresh local Error.
    extras[key] = isSensitiveKey(key)
      ? SENSITIVE_REDACTION_PLACEHOLDER
      : redactValue({ input: value, context: { ...context, depth: context.depth + 1 } });
  }

  return output;
}

function redactValue<T>({ input, context }: { input: T; context: RedactionContext }): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return redactSensitiveString(input) as T;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (context.depth >= MAX_REDACTION_DEPTH) {
    return SENSITIVE_REDACTION_PLACEHOLDER as T;
  }

  if (input instanceof Error) {
    return redactError({ input, context }) as T;
  }

  if (Array.isArray(input)) {
    const existingArray = context.visited.get(input);
    if (existingArray !== undefined) {
      return existingArray as T;
    }

    const output: unknown[] = [];
    context.visited.set(input, output);
    for (const item of input) {
      output.push(redactValue({ input: item, context: { ...context, depth: context.depth + 1 } }));
    }
    return output as T;
  }

  const existingObject = context.visited.get(input);
  if (existingObject !== undefined) {
    return existingObject as T;
  }

  const output: Record<string, unknown> = {};
  context.visited.set(input, output);

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // eslint-disable-next-line security/detect-object-injection -- key from Object.entries of the input being redacted; written to a fresh local object.
    output[key] = isSensitiveKey(key)
      ? SENSITIVE_REDACTION_PLACEHOLDER
      : redactValue({ input: value, context: { ...context, depth: context.depth + 1 } });
  }
  return output as T;
}

/**
 * Returns a deep copy of `input` with values for sensitive keys (and
 * URL/query-string-shaped strings containing sensitive parameters) replaced
 * by `[REDACTED]`. Walks up to {@link MAX_REDACTION_DEPTH} levels and tracks
 * cyclic references via WeakMap. Used by the Pino logger and Sentry
 * `beforeSend` so headers, body, breadcrumbs, and extras are scrubbed.
 */
export function redactSensitive<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return redactSensitiveString(input) as T;
  }

  if (typeof input !== 'object') {
    return input;
  }

  return redactValue({ input, context: { visited: new WeakMap(), depth: 0 } });
}
