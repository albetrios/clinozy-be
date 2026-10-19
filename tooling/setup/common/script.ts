/**
 * The one way a tooling script reads its command line and knows it is the entry module.
 *
 * {@link parseCommandLine} reads every command line with node:util `parseArgs` — `--name value`,
 * `--name=value`, short flags (`-h`), `--` — strictly: an unknown option, a value option without
 * its value, or more positionals than the script takes throws an Error naming it. {@link isMain}
 * replaces the `process.argv[1]` comparisons each script carried.
 * `src/tests/unit/ci/tooling-command-line.policy.unit.test.ts` holds every script under
 * `tooling/`, `src/scripts/` and `agent-os/evals/` to both.
 *
 * Plain TypeScript with erasable syntax only and node: imports only, so the `.mjs` scripts that
 * `node` runs directly import it too (Node strips the types).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * True when the module at `importMetaUrl` is the script node was started with — not a test or
 * another script importing it.
 *
 * @param importMetaUrl - the caller's `import.meta.url`
 * @returns whether the caller is the entry module
 * @remarks
 * Algorithm: resolves `process.argv[1]` (the entry path node or tsx was given, relative or
 * absolute) and compares it with the caller's file path.
 * Failure modes: none — no entry path (a REPL, `node -e`) is simply `false`.
 * Side effects: none.
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(importMetaUrl);
}

/**
 * One option a script accepts: a `boolean` flag or a `string` value, optionally with a one-letter
 * `short` alias, and `multiple` to collect a repeated value option into an array.
 *
 * @remarks
 * Notes: the same shape node:util `parseArgs` takes, minus `default` — a script keeps its own
 * defaults (`values.port ?? '4000'`).
 */
export interface CommandLineOption {
  readonly type: 'boolean' | 'string';
  readonly short?: string;
  readonly multiple?: boolean;
}

/**
 * A script's own wording for an unknown option or a missing value; returning `undefined` keeps
 * the default wording.
 *
 * @remarks
 * Notes: each callback receives the option as the user spelled it (`--colour`, `-x`,
 * `--check=yes`).
 */
export interface CommandLineMessages {
  readonly unknownOption?: (option: string) => string | undefined;
  readonly needsValue?: (option: string) => string | undefined;
}

/**
 * The value an option yields: `true` for a flag, the text for a value option, every text in order
 * for a `multiple` one.
 *
 * @remarks
 * Notes: derived from the option's declaration, so `values.check` is `boolean | undefined` and
 * `values.base` is `string | undefined` without a cast.
 */
export type CommandLineOptionValue<Option extends CommandLineOption> =
  Option['type'] extends 'boolean' ? boolean : Option['multiple'] extends true ? string[] : string;

/**
 * Every option given on the command line, by its declared name; an option not given is absent.
 *
 * @remarks
 * Notes: keyed by the long name even when the short alias was typed.
 */
export type CommandLineValues<Options extends Readonly<Record<string, CommandLineOption>>> = {
  -readonly [Name in keyof Options]?: CommandLineOptionValue<Options[Name]>;
};

/**
 * What {@link parseCommandLine} reads: the arguments and the shape a script accepts.
 *
 * @remarks
 * Notes: `args` is the argument list after the script (`process.argv.slice(2)`, or a list a test
 * hands in). `maxPositionals` defaults to 0; pass `Number.POSITIVE_INFINITY` for a script that
 * takes any number. `usage` is appended to a missing-value or too-many-arguments error.
 */
export interface CommandLineShape<Options extends Readonly<Record<string, CommandLineOption>>> {
  readonly args: readonly string[];
  readonly options?: Options;
  readonly maxPositionals?: number;
  readonly usage?: string;
  readonly messages?: CommandLineMessages;
}

/**
 * A parsed command line: each given option by its name, and the positionals in order.
 *
 * @remarks
 * Notes: positionals after a `--` that is not the first argument are included as given, even
 * when they start with `-`.
 */
export interface ParsedCommandLine<Options extends Readonly<Record<string, CommandLineOption>>> {
  readonly values: CommandLineValues<Options>;
  readonly positionals: string[];
}

/**
 * Reads a script's command line with node:util `parseArgs`, strictly.
 *
 * @param shape - the arguments and the options, positional count, usage and wording the script
 *   accepts
 * @returns each given option by its name (a `multiple` one as an array), and the positionals
 * @throws Error `Unknown option "<option>".`, `<option> needs a value — <usage>` (missing, empty,
 *   or another `--option` in its place), or `Too many arguments: … — <usage>`
 * @remarks
 * Algorithm: tokenises with `parseArgs({ strict: false, tokens: true })` — which understands
 * `--name value`, `--name=value`, grouped short flags and the `--` terminator — then checks each
 * option token against `options` itself, so the error names the option the way it was typed.
 * A flag given a value (`--check=yes`) is an unknown option, not a silently ignored value.
 * A leading `--` is dropped first: it is the separator a package manager forwards
 * (`pnpm <script> -- --flag`), not an end of options; a later `--` ends the options.
 * Failure modes: throws on the first unknown option or missing value, in command-line order, and
 * on more positionals than `maxPositionals`.
 * Side effects: none — the caller prints the message and picks the exit code.
 */
export function parseCommandLine<
  const Options extends Readonly<Record<string, CommandLineOption>> = Record<never, never>,
>(shape: CommandLineShape<Options>): ParsedCommandLine<Options> {
  const { args, maxPositionals = 0, usage, messages = {} } = shape;
  const options: Readonly<Record<string, CommandLineOption>> = shape.options ?? {};
  const withUsage = (message: string): string => (usage ? `${message} — ${usage}` : `${message}.`);
  const unknownOption = (option: string): string =>
    messages.unknownOption?.(option) ?? `Unknown option "${option}".`;
  const needsValue = (option: string): string =>
    messages.needsValue?.(option) ?? withUsage(`${option} needs a value`);
  // `pnpm <script> -- --flag` hands the script the `--` too: a leading one is that separator.
  const given = args[0] === '--' ? args.slice(1) : [...args];
  const { tokens } = parseArgs({
    args: given,
    options,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const values: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];
  for (const token of tokens) {
    if (token.kind === 'positional') positionals.push(token.value);
    if (token.kind !== 'option') continue;
    const option = Object.hasOwn(options, token.name) ? options[token.name] : undefined;
    const spelled = token.inlineValue ? `${token.rawName}=${token.value}` : token.rawName;
    if (option === undefined || (option.type === 'boolean' && token.value !== undefined)) {
      throw new Error(unknownOption(spelled));
    }
    if (option.type === 'boolean') {
      values[token.name] = true;
      continue;
    }
    const value = token.value;
    if (value === undefined || value === '' || (!token.inlineValue && value.startsWith('--'))) {
      throw new Error(needsValue(token.rawName));
    }
    const earlier = values[token.name];
    values[token.name] = option.multiple
      ? [...(Array.isArray(earlier) ? earlier : []), value]
      : value;
  }
  if (positionals.length > maxPositionals) {
    throw new Error(withUsage(`Too many arguments: ${positionals.join(' ')}`));
  }
  return { values: values as CommandLineValues<Options>, positionals };
}
