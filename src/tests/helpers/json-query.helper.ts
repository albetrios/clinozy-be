/**
 * A small jq subset for reading JSON response bodies in flow tests.
 *
 * @remarks
 * The launch iteration first checked every app route with curl and jq; the Vitest flows that
 * replaced those checks kept the same expressions, so each assertion reads exactly as the proven
 * check did. This is not jq — it covers what those checks use:
 * - paths `.a.b`, `.[0]`, `.a[-1]`, `.a[]`, `.[1:]`, and `.`;
 * - pipes `|`, commas `,`, collection `[…]`, grouping `(…)`;
 * - literals: strings (with `\(…)` interpolation), numbers, `true`, `false`, `null`;
 * - operators `==`, `!=`, `<`, `<=`, `>`, `>=`, `and`, `or`, `//`;
 * - functions `length`, `join`, `map`, `select`, `tostring`, `sort`, `unique`, `keys`, `first`,
 *   `all`, `any`, `has`, `startswith`, `endswith`, `contains`, `test`, `rtrimstr`, `split`,
 *   `index`, `type`, `empty`, `not`.
 *
 * {@link jsonQuery} answers what `jq -r` prints: a string as it is, anything else as compact JSON,
 * several outputs one per line, no output as an empty string.
 */

/** A JSON value as a response body holds it. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type Node =
  | { kind: 'identity' }
  | { kind: 'literal'; value: JsonValue }
  | { kind: 'template'; parts: Array<string | Node> }
  | { kind: 'field'; target: Node; name: string; optional: boolean }
  | { kind: 'index'; target: Node; index: Node }
  | { kind: 'slice'; target: Node; from: number | null; to: number | null }
  | { kind: 'iterate'; target: Node }
  | { kind: 'pipe'; left: Node; right: Node }
  | { kind: 'comma'; left: Node; right: Node }
  | { kind: 'collect'; body: Node | null }
  | { kind: 'binary'; operator: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

type Token =
  | { type: 'punctuation'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'identifier'; value: string }
  | { type: 'field'; value: string }
  | { type: 'number'; value: number }
  | { type: 'string'; value: Array<string | Token[]> }
  | { type: 'end' };

const OPERATORS = ['==', '!=', '<=', '>=', '//', '<', '>', '|', ','];
const PUNCTUATION = new Set(['(', ')', '[', ']', ':', ';']);

/** Reads a jq string literal starting after its opening quote; returns its parts and end index. */
function readString(
  source: string,
  start: number,
): { parts: Array<string | Token[]>; end: number } {
  const parts: Array<string | Token[]> = [];
  let text = '';
  let position = start;
  while (position < source.length) {
    const character = source[position]!;
    if (character === '"') {
      parts.push(text);
      return { parts, end: position + 1 };
    }
    if (character === '\\') {
      const next = source[position + 1];
      if (next === '(') {
        parts.push(text);
        text = '';
        let depth = 1;
        let cursor = position + 2;
        while (cursor < source.length && depth > 0) {
          if (source[cursor] === '(') depth += 1;
          if (source[cursor] === ')') depth -= 1;
          cursor += 1;
        }
        parts.push(tokenize(source.slice(position + 2, cursor - 1)));
        position = cursor;
        continue;
      }
      const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };
      text += escapes[next ?? ''] ?? next ?? '';
      position += 2;
      continue;
    }
    text += character;
    position += 1;
  }
  throw new Error(`json-query: unterminated string in ${source}`);
}

/** Splits an expression into tokens. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position]!;
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if (character === '"') {
      const { parts, end } = readString(source, position + 1);
      tokens.push({ type: 'string', value: parts });
      position = end;
      continue;
    }
    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, position));
    if (operator) {
      tokens.push({ type: 'operator', value: operator });
      position += operator.length;
      continue;
    }
    if (PUNCTUATION.has(character)) {
      tokens.push({ type: 'punctuation', value: character });
      position += 1;
      continue;
    }
    if (character === '.') {
      const match = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(position));
      if (match) {
        tokens.push({ type: 'field', value: match[1]! });
        position += match[0].length;
      } else {
        tokens.push({ type: 'punctuation', value: '.' });
        position += 1;
      }
      continue;
    }
    const number = /^-?\d+(\.\d+)?/.exec(source.slice(position));
    if (number && (character !== '-' || tokens.length === 0 || isOperand(tokens.at(-1)))) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      position += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(position));
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      position += identifier[0].length;
      continue;
    }
    throw new Error(`json-query: unexpected '${character}' in ${source}`);
  }
  tokens.push({ type: 'end' });
  return tokens;
}

/** Whether a negative number may follow this token (it starts an operand, not a subtraction). */
function isOperand(token: Token | undefined): boolean {
  if (!token) return true;
  if (token.type === 'operator') return true;
  return token.type === 'punctuation' && ['(', '[', ':', ';'].includes(token.value);
}

/** A recursive-descent parser over {@link tokenize}'s tokens. */
class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.pipe();
    if (this.peek().type !== 'end') {
      throw new Error(`json-query: unexpected ${JSON.stringify(this.peek())}`);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    const token = this.tokens[this.position]!;
    this.position += 1;
    return token;
  }

  private isPunctuation(value: string): boolean {
    const token = this.peek();
    return token.type === 'punctuation' && token.value === value;
  }

  private isOperator(value: string): boolean {
    const token = this.peek();
    return token.type === 'operator' && token.value === value;
  }

  private isKeyword(value: string): boolean {
    const token = this.peek();
    return token.type === 'identifier' && token.value === value;
  }

  private expectPunctuation(value: string): void {
    if (!this.isPunctuation(value)) {
      throw new Error(`json-query: expected '${value}', got ${JSON.stringify(this.peek())}`);
    }
    this.next();
  }

  pipe(): Node {
    const left = this.comma();
    if (this.isOperator('|')) {
      this.next();
      return { kind: 'pipe', left, right: this.pipe() };
    }
    return left;
  }

  private comma(): Node {
    let left = this.alternative();
    while (this.isOperator(',')) {
      this.next();
      left = { kind: 'comma', left, right: this.alternative() };
    }
    return left;
  }

  private alternative(): Node {
    const left = this.or();
    if (this.isOperator('//')) {
      this.next();
      return { kind: 'binary', operator: '//', left, right: this.alternative() };
    }
    return left;
  }

  private or(): Node {
    let left = this.and();
    while (this.isKeyword('or')) {
      this.next();
      left = { kind: 'binary', operator: 'or', left, right: this.and() };
    }
    return left;
  }

  private and(): Node {
    let left = this.comparison();
    while (this.isKeyword('and')) {
      this.next();
      left = { kind: 'binary', operator: 'and', left, right: this.comparison() };
    }
    return left;
  }

  private comparison(): Node {
    const left = this.postfix();
    const token = this.peek();
    if (token.type === 'operator' && ['==', '!=', '<', '<=', '>', '>='].includes(token.value)) {
      this.next();
      return { kind: 'binary', operator: token.value, left, right: this.postfix() };
    }
    return left;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const token = this.peek();
      if (token.type === 'field') {
        this.next();
        node = { kind: 'field', target: node, name: token.value, optional: false };
        continue;
      }
      if (this.isPunctuation('[')) {
        node = this.bracket(node);
        continue;
      }
      return node;
    }
  }

  /** `[]`, `[n]`, `[n:m]` or `[expr]` after a value. */
  private bracket(target: Node): Node {
    this.expectPunctuation('[');
    if (this.isPunctuation(']')) {
      this.next();
      return { kind: 'iterate', target };
    }
    if (this.isPunctuation(':')) {
      this.next();
      const to = this.sliceBound();
      this.expectPunctuation(']');
      return { kind: 'slice', target, from: null, to };
    }
    const index = this.pipe();
    if (this.isPunctuation(':')) {
      this.next();
      const to = this.sliceBound();
      this.expectPunctuation(']');
      const from = index.kind === 'literal' && typeof index.value === 'number' ? index.value : null;
      return { kind: 'slice', target, from, to };
    }
    this.expectPunctuation(']');
    return { kind: 'index', target, index };
  }

  private sliceBound(): number | null {
    const token = this.peek();
    if (token.type === 'number') {
      this.next();
      return token.value;
    }
    return null;
  }

  private primary(): Node {
    const token = this.next();
    switch (token.type) {
      case 'field':
        return { kind: 'field', target: { kind: 'identity' }, name: token.value, optional: false };
      case 'number':
        return { kind: 'literal', value: token.value };
      case 'string':
        return {
          kind: 'template',
          parts: token.value.map((part) =>
            typeof part === 'string' ? part : new Parser(part).parse(),
          ),
        };
      case 'punctuation':
        return this.punctuationPrimary(token.value);
      case 'identifier':
        return this.identifierPrimary(token.value);
      default:
        throw new Error(`json-query: unexpected ${JSON.stringify(token)}`);
    }
  }

  private punctuationPrimary(value: string): Node {
    if (value === '.') return { kind: 'identity' };
    if (value === '(') {
      const inner = this.pipe();
      this.expectPunctuation(')');
      return inner;
    }
    if (value === '[') {
      if (this.isPunctuation(']')) {
        this.next();
        return { kind: 'collect', body: null };
      }
      const body = this.pipe();
      this.expectPunctuation(']');
      return { kind: 'collect', body };
    }
    throw new Error(`json-query: unexpected '${value}'`);
  }

  private identifierPrimary(name: string): Node {
    if (name === 'true') return { kind: 'literal', value: true };
    if (name === 'false') return { kind: 'literal', value: false };
    if (name === 'null') return { kind: 'literal', value: null };
    const args: Node[] = [];
    if (this.isPunctuation('(')) {
      this.next();
      args.push(this.pipe());
      while (this.isPunctuation(';')) {
        this.next();
        args.push(this.pipe());
      }
      this.expectPunctuation(')');
    }
    return { kind: 'call', name, args };
  }
}

/** jq's truthiness: everything but `false` and `null`. */
function isTruthy(value: JsonValue): boolean {
  return value !== false && value !== null;
}

/** jq's `tostring`: a string as it is, anything else as compact JSON. */
function toText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** jq's ordering: null < false < true < numbers < strings < arrays < objects. */
function compare(left: JsonValue, right: JsonValue): number {
  const rank = (value: JsonValue): number => {
    if (value === null) return 0;
    if (value === false) return 1;
    if (value === true) return 2;
    if (typeof value === 'number') return 3;
    if (typeof value === 'string') return 4;
    return Array.isArray(value) ? 5 : 6;
  };
  const difference = rank(left) - rank(right);
  if (difference !== 0) return difference;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function isEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asArray(value: JsonValue, name: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`json-query: ${name} needs an array`);
  return value;
}

function asString(value: JsonValue, name: string): string {
  if (typeof value !== 'string') throw new Error(`json-query: ${name} needs a string`);
  return value;
}

/** The single output of an argument (jq would fan out; the checks never need that). */
function single(node: Node, input: JsonValue): JsonValue {
  const outputs = evaluate(node, input);
  return outputs[0] ?? null;
}

const FUNCTIONS: Record<string, (input: JsonValue, args: Node[]) => JsonValue[]> = {
  empty: () => [],
  not: (input) => [!isTruthy(input)],
  length: (input) => {
    if (input === null) return [0];
    if (typeof input === 'string' || Array.isArray(input)) return [input.length];
    if (typeof input === 'object') return [Object.keys(input).length];
    return [Math.abs(input as number)];
  },
  tostring: (input) => [toText(input)],
  type: (input) => {
    if (input === null) return ['null'];
    if (Array.isArray(input)) return ['array'];
    return [typeof input === 'object' ? 'object' : typeof input];
  },
  keys: (input) => {
    if (Array.isArray(input)) return [input.map((_, index) => index)];
    if (input && typeof input === 'object') return [Object.keys(input).sort()];
    throw new Error('json-query: keys needs an object');
  },
  first: (input, args) =>
    args.length > 0 ? evaluate(args[0]!, input).slice(0, 1) : [asArray(input, 'first')[0] ?? null],
  all: (input) => [asArray(input, 'all').every(isTruthy)],
  any: (input) => [asArray(input, 'any').some(isTruthy)],
  sort: (input) => [[...asArray(input, 'sort')].sort(compare)],
  unique: (input) => {
    const sorted = [...asArray(input, 'unique')].sort(compare);
    return [sorted.filter((value, index) => index === 0 || !isEqual(value, sorted[index - 1]!))];
  },
  join: (input, args) => {
    const separator = asString(single(args[0]!, input), 'join');
    return [
      asArray(input, 'join')
        .map((value) => (value === null ? '' : toText(value)))
        .join(separator),
    ];
  },
  map: (input, args) => [asArray(input, 'map').flatMap((value) => evaluate(args[0]!, value))],
  select: (input, args) => (evaluate(args[0]!, input).some(isTruthy) ? [input] : []),
  has: (input, args) => {
    const key = single(args[0]!, input);
    if (Array.isArray(input)) return [typeof key === 'number' && key < input.length];
    return [input !== null && typeof input === 'object' && String(key) in input];
  },
  startswith: (input, args) => [
    asString(input, 'startswith').startsWith(asString(single(args[0]!, input), 'startswith')),
  ],
  endswith: (input, args) => [
    asString(input, 'endswith').endsWith(asString(single(args[0]!, input), 'endswith')),
  ],
  contains: (input, args) => [
    asString(input, 'contains').includes(asString(single(args[0]!, input), 'contains')),
  ],
  test: (input, args) => [
    new RegExp(asString(single(args[0]!, input), 'test')).test(asString(input, 'test')),
  ],
  rtrimstr: (input, args) => {
    const suffix = single(args[0]!, input);
    if (typeof input === 'string' && typeof suffix === 'string' && input.endsWith(suffix)) {
      return [input.slice(0, input.length - suffix.length)];
    }
    return [input];
  },
  split: (input, args) => [
    asString(input, 'split').split(asString(single(args[0]!, input), 'split')),
  ],
  index: (input, args) => {
    const needle = single(args[0]!, input);
    if (input === null) return [null];
    const position = Array.isArray(input)
      ? input.findIndex((value) => isEqual(value, needle))
      : asString(input, 'index').indexOf(asString(needle, 'index'));
    return [position === -1 ? null : position];
  },
};

function evaluateBinary(node: Extract<Node, { kind: 'binary' }>, input: JsonValue): JsonValue[] {
  if (node.operator === '//') {
    const truthy = evaluate(node.left, input).filter(isTruthy);
    return truthy.length > 0 ? truthy : evaluate(node.right, input);
  }
  if (node.operator === 'and') {
    return evaluate(node.left, input).flatMap((left) =>
      isTruthy(left) ? evaluate(node.right, input).map(isTruthy) : [false],
    );
  }
  if (node.operator === 'or') {
    return evaluate(node.left, input).flatMap((left) =>
      isTruthy(left) ? [true] : evaluate(node.right, input).map(isTruthy),
    );
  }
  return evaluate(node.right, input).flatMap((right) =>
    evaluate(node.left, input).map((left) => {
      switch (node.operator) {
        case '==':
          return isEqual(left, right);
        case '!=':
          return !isEqual(left, right);
        case '<':
          return compare(left, right) < 0;
        case '<=':
          return compare(left, right) <= 0;
        case '>':
          return compare(left, right) > 0;
        default:
          return compare(left, right) >= 0;
      }
    }),
  );
}

function indexInto(target: JsonValue, index: JsonValue): JsonValue {
  if (target === null) return null;
  if (typeof index === 'number') {
    const list = asArray(target, 'index');
    return list[index < 0 ? list.length + index : index] ?? null;
  }
  if (typeof index === 'string' && typeof target === 'object' && !Array.isArray(target)) {
    return target[index] ?? null;
  }
  throw new Error(`json-query: cannot index ${JSON.stringify(target)} with ${index}`);
}

function evaluate(node: Node, input: JsonValue): JsonValue[] {
  switch (node.kind) {
    case 'identity':
      return [input];
    case 'literal':
      return [node.value];
    case 'template':
      return [
        node.parts
          .map((part) =>
            typeof part === 'string' ? part : evaluate(part, input).map(toText).join(''),
          )
          .join(''),
      ];
    case 'field':
      return evaluate(node.target, input).map((value) => indexInto(value, node.name));
    case 'index':
      return evaluate(node.target, input).flatMap((value) =>
        evaluate(node.index, input).map((index) => indexInto(value, index)),
      );
    case 'slice':
      return evaluate(node.target, input).map((value) => {
        if (value === null) return null;
        const sliceable = typeof value === 'string' ? value : asArray(value, 'slice');
        return sliceable.slice(node.from ?? 0, node.to ?? undefined) as JsonValue;
      });
    case 'iterate':
      return evaluate(node.target, input).flatMap((value) => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        throw new Error(`json-query: cannot iterate ${JSON.stringify(value)}`);
      });
    case 'pipe':
      return evaluate(node.left, input).flatMap((value) => evaluate(node.right, value));
    case 'comma':
      return [...evaluate(node.left, input), ...evaluate(node.right, input)];
    case 'collect':
      return [node.body ? evaluate(node.body, input) : []];
    case 'binary':
      return evaluateBinary(node, input);
    case 'call': {
      const implementation = FUNCTIONS[node.name];
      if (!implementation) throw new Error(`json-query: unknown function ${node.name}`);
      return implementation(input, node.args);
    }
  }
}

/** Every output of `expression` on `input`, as jq streams them. */
export function jsonQueryAll(input: JsonValue, expression: string): JsonValue[] {
  return evaluate(new Parser(tokenize(expression)).parse(), input);
}

/**
 * What `jq -r <expression>` prints for `input`: strings raw, other values as compact JSON, several
 * outputs one per line, none as an empty string.
 */
export function jsonQuery(input: JsonValue, expression: string): string {
  return jsonQueryAll(input, expression).map(toText).join('\n');
}
