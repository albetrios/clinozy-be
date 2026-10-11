import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Service-layer functions take one options object (rule: `be-object-params.mdc`).
 *
 * A service method is called from controllers, other domains' services, workers and tests;
 * positional arguments of the same type (`revoke(userPublicId, sessionPublicId)`) swap without a
 * compiler error. Every `*.service.ts` method, function and port signature with two or more
 * parameters takes a single options object instead. Exempt: constructors (dependency injection,
 * wired once in the containers) and Fastify handlers (`request`, `reply`).
 *
 * The scan finds each declaration — a method or function name at the start of a line followed by
 * a parameter list and then `{` or a `:` return type (a call statement is followed by neither), or
 * a `const name = (...) =>` — and counts its top-level parameters.
 */
describe('Global: service-layer functions take one options object', () => {
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

  async function listServiceFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        files.push(...(await listServiceFiles(path)));
      } else if (entry.name.endsWith('.service.ts')) {
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
      if (parameters.some((parameter) => /^_?(request|reply)\b/.test(parameter))) return;
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
      '}',
    ].join('\n');
    expect(findViolations(accepted)).toEqual([]);
  });

  it('no *.service.ts function takes two or more positional parameters', async () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of await listServiceFiles(join(root, 'src'))) {
      const source = await fs.readFile(file, 'utf8');
      for (const violation of findViolations(source)) {
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
