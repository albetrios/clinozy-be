import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Functions take one options object once they have two or more parameters (rule:
 * `be-object-params.mdc`).
 *
 * Positional arguments of the same type (`revoke(userPublicId, sessionPublicId)`) swap without a
 * compiler error. Every method, function and port signature under `src/` — tests and
 * `*.repository.ts` aside — with two or more parameters takes a single options object instead.
 * Exempt: constructors (dependency injection, wired once in the containers), the exact Fastify
 * handler shapes ({@link FASTIFY_SHAPES}) and the signatures a third party calls positionally
 * ({@link FRAMEWORK_DICTATED}).
 *
 * The scan finds each declaration — a method or function name at the start of a line followed by
 * a parameter list and then `{` or a `:` return type (a call statement is followed by neither), or
 * a `const name = (...) =>` — and counts its top-level parameters.
 */
/**
 * `file#name` of the signatures a library calls with positional arguments, so they keep its shape.
 * Anonymous callbacks (i18next's `t`, Fastify's `trustProxy`, a fetch-compatible `(input, init)`)
 * are not declarations and never reach the scan.
 */
const FRAMEWORK_DICTATED = new Set([
  // BullMQ backoff strategy: (attemptsMade, type, error, job)
  'src/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook-backoff.util.ts#stripeWebhookBackoffStrategy',
  'src/infrastructure/mail/queues/mail-backoff.util.ts#mailBackoffStrategy',
  // @fastify/rate-limit store: incr(key, callback, timeWindow, max)
  'src/shared/middlewares/rate-limit/rate-limit-fallback-store.ts#incr',
  // @fastify/rate-limit store: read(key, callback, timeWindow, max) — the `{ increment: false }` twin
  'src/shared/middlewares/rate-limit/rate-limit-fallback-store.ts#read',
  // ioredis custom Lua command: positional KEYS / ARGV
  'src/infrastructure/resilience/circuit-breaker.ts#circuitMutate',
  // BullMQ Worker's `on(event, listener)`, typed structurally
  'src/infrastructure/queue/worker-runtime/worker-queue-heartbeat.ts#on',
  // Fastify onSend hooks registered by reference: (request, reply, payload)
  'src/shared/middlewares/core/idempotency.middleware.ts#idempotencyOnSend',
  'src/shared/middlewares/core/request-lifecycle.middleware.ts#finalizeWhenTheClientLeaves',
  // @fastify/rate-limit onExceeded(request, key)
  'src/shared/middlewares/rate-limit/rate-limit-presets.constants.ts#recordRouteRateLimitExceeded',
  'src/shared/middlewares/rate-limit/rate-limit.middleware.ts#recordGlobalRateLimitExceeded',
]);

/** Exactly the shapes Fastify calls: route handlers, hooks with `done`, the error handler. */
const FASTIFY_SHAPES = new Set(['request,reply', 'request,reply,done', 'error,request,reply']);

describe('Global: functions take one options object', () => {
  const NOT_DECLARATIONS = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'await',
    'typeof',
    'function',
    'constructor',
  ]);
  const DECLARATION_START =
    /^[ \t]*(?:export\s+)?(?:(?:public|private|protected|static|readonly|async|override|declare)\s+)*(?:function\s*\*?\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*\(/gm;
  const ARROW_START =
    /^[ \t]*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/gm;

  async function listSourceFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        if (path === join(process.cwd(), 'src', 'tests')) continue;
        files.push(...(await listSourceFiles(path)));
      } else if (entry.name.endsWith('.ts') && !/\.(test|repository|d)\.ts$/.test(entry.name)) {
        files.push(path);
      }
    }
    return files;
  }

  /** The text between the `(` at `openIndex` and its matching `)`, and the index after it. */
  function readParameterList(source: string, openIndex: number) {
    let depth = 0;
    for (let index = openIndex; index < source.length; index += 1) {
      const character = source[index];
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) return { text: source.slice(openIndex + 1, index), end: index + 1 };
      }
    }
    return undefined;
  }

  /** Top-level parameters: commas outside brackets, braces, parentheses and type arguments. */
  function splitParameters(text: string): string[] {
    const parameters: string[] = [];
    let depth = 0;
    let current = '';
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index] as string;
      if ('([{<'.includes(character)) depth += 1;
      if (')]}'.includes(character)) depth -= 1;
      // `=>` inside a function type is not a closing angle bracket.
      if (character === '>' && text[index - 1] !== '=') depth -= 1;
      if (character === ',' && depth === 0) {
        parameters.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    parameters.push(current);
    return parameters.map((parameter) => parameter.trim()).filter((parameter) => parameter !== '');
  }

  function findViolations(
    source: string,
  ): Array<{ name: string; line: number; parameters: string[] }> {
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (comment) => ' '.repeat(comment.length));
    const violations: Array<{ name: string; line: number; parameters: string[] }> = [];
    const inspect = (match: RegExpExecArray, isArrow: boolean) => {
      const name = match[1] as string;
      if (NOT_DECLARATIONS.has(name)) return;
      const list = readParameterList(withoutComments, match.index + match[0].length - 1);
      if (!list) return;
      const following = withoutComments.slice(list.end).trimStart();
      if (isArrow ? !/^(:[^=]*)?=>/.test(following) : !/^[{:]/.test(following)) return;
      const parameters = splitParameters(list.text).filter(
        (parameter) => !/^this\s*:/.test(parameter),
      );
      if (parameters.length < 2) return;
      const shape = parameters
        .map((parameter) => (parameter.match(/^[\w$]+/)?.[0] ?? '').replace(/^_+/, ''))
        .join(',');
      if (FASTIFY_SHAPES.has(shape)) return;
      const line = withoutComments.slice(0, match.index).split('\n').length;
      violations.push({ name, line, parameters });
    };
    for (const match of withoutComments.matchAll(DECLARATION_START)) inspect(match, false);
    for (const match of withoutComments.matchAll(ARROW_START)) inspect(match, true);
    return violations;
  }

  it('finds a two-parameter method, function and arrow, and accepts the options form', () => {
    const offending = [
      'export class ExampleService {',
      '  async revoke(userPublicId: string, sessionPublicId: string): Promise<void> {}',
      '}',
      'export function build(left: string, right: string): string { return left; }',
      'const pick = (first: number, second: number) => first;',
    ].join('\n');
    expect(findViolations(offending).map((violation) => violation.name)).toEqual([
      'revoke',
      'build',
      'pick',
    ]);

    const accepted = [
      'export class ExampleService {',
      '  constructor(private readonly repository: Repository, private readonly redis: Redis) {}',
      '  async revoke({ userPublicId, sessionPublicId }: { userPublicId: string; sessionPublicId: string }) {',
      '    await this.repository.revoke(userPublicId, sessionPublicId);',
      '    rows.map((row, index) => row);',
      '  }',
      '  async list(scope: Scope): Promise<Row[]> { return []; }',
      '  handle(request: FastifyRequest, reply: FastifyReply) {}',
      '  hook(request: FastifyRequest, reply: FastifyReply, done: () => void) {}',
      '}',
    ].join('\n');
    expect(findViolations(accepted)).toEqual([]);
  });

  it('no source function takes two or more positional parameters', async () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of await listSourceFiles(join(root, 'src'))) {
      const source = await fs.readFile(file, 'utf8');
      for (const violation of findViolations(source)) {
        if (FRAMEWORK_DICTATED.has(`${relative(root, file)}#${violation.name}`)) continue;
        offenders.push(
          `${relative(root, file)}:${violation.line} ${violation.name}(${violation.parameters
            .map((parameter) => parameter.split(/[:=?]/)[0]?.trim())
            .join(', ')})`,
        );
      }
    }
    expect(offenders, 'take one options object instead (be-object-params.mdc)').toEqual([]);
  });
});
