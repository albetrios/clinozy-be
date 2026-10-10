/**
 * Extracts `schema.summary`, `schema.description`, and `schema.tags` literals
 * from every Fastify route registration in `src/domains/**\/*.routes.ts` plus
 * the supplemental `/livez`, `/readyz`, and `/api/v1/mcp` registrations.
 *
 * Returned map is keyed by `${METHOD} ${OPENAPI_PATH}` (Fastify path params
 * `:name` are converted to OpenAPI `{name}`).
 *
 * Used by the OpenAPI document builder as the **single source of truth** for
 * operation summary / description / tags.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_PATH_PATTERN } from '@tooling/openapi/route-catalog/constants.js';
import { listDomainRouteFiles } from '@tooling/openapi/route-catalog/file-collectors.js';
import { findOptionsObjectRange, findSchemaPropertyRange } from './schema-locator.js';

export interface RouteSchemaMetadata {
  summary: string | null;
  description: string | null;
  tags: string[] | null;
}

// A quoted literal — its quote (group 1) and its raw body (group 2). An escaped quote inside
// (`\'`, `\"`, `` \` ``) does not end it: matching up to the first quote of the kind cut every
// description holding one (`the drawer\'s "Paid"`) short in the generated document.
const SUMMARY_LITERAL_PATTERN = /\bsummary\s*:\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/;
const DESCRIPTION_LITERAL_PATTERN = /\bdescription\s*:\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/;
/** An escape (group 1) or, in a template literal, a `${NAME}` interpolation (group 2). */
const ESCAPE_OR_INTERPOLATION_PATTERN = /\\(['"`\\])|\$\{\s*([A-Za-z_]\w*)\s*\}/g;
/** How deep a `${NAME}` may lead to a constant that interpolates another. */
const INTERPOLATION_DEPTH_MAX = 3;
const TAGS_ARRAY_PATTERN = /\btags\s*:\s*\[([\s\S]*?)\]/;
const STRING_LITERAL_PATTERN = /(['"`])([\s\S]*?)\1/g;

const DOMAIN_PREFIX_BY_FOLDER: Record<string, string> = {
  audit: '/api/v1/audit',
  auth: '/api/v1/auth',
  user: '/api/v1/users',
  tenancy: '/api/v1/tenancy',
  billing: '/api/v1/billing',
  notify: '/api/v1/notify',
  upload: '/api/v1/uploads',
  app: '/api/v1/app',
};

const SUPPLEMENTAL_ROUTE_FILES: Array<{ absolutePath: string; prefix: string }> = [
  {
    absolutePath: join(process.cwd(), 'src', 'shared', 'middlewares', 'health.middleware.ts'),
    prefix: '',
  },
  {
    absolutePath: join(process.cwd(), 'src', 'infrastructure', 'mcp', 'mcp-server.ts'),
    prefix: '',
  },
];

const ROUTE_METHOD_PATTERN_BROAD =
  /\b(?:app|application|zodApplication|stripeZodApplication)\.(get|post|patch|put|delete)\b/g;

function pathToOpenapi(fastifyPath: string): string {
  return fastifyPath.replace(/:([A-Za-z_$][\w$]*)/g, '{$1}');
}

function buildLookupKey(method: string, fastifyFullPath: string): string {
  return `${method} ${pathToOpenapi(fastifyFullPath)}`;
}

function inferDomainPrefixForFile(routeFileAbsolutePath: string): string | null {
  const segments = routeFileAbsolutePath.split('/');
  const domainsIndex = segments.lastIndexOf('domains');
  if (domainsIndex === -1) return null;
  const domainFolder = segments[domainsIndex + 1] ?? '';
  return DOMAIN_PREFIX_BY_FOLDER[domainFolder] ?? null;
}

function extractTagsFromArrayBody(arrayBody: string): string[] {
  const tags: string[] = [];
  for (const match of arrayBody.matchAll(STRING_LITERAL_PATTERN)) {
    const literal = match[2] ?? '';
    if (literal.length > 0) tags.push(literal);
  }
  return tags;
}

/** A `const NAME = '…'` (exported or not) in a source text — its quote and raw body. */
function findStringConstant(options: {
  name: string;
  sourceText: string;
}): { quote: string; body: string } | undefined {
  const constant = new RegExp(
    `\\bconst\\s+${options.name}\\s*(?::[^=]+)?=\\s*(['"\`])((?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*)\\1`,
  ).exec(options.sourceText);
  if (constant?.[1] === undefined || constant[2] === undefined) return undefined;
  return { quote: constant[1], body: constant[2] };
}

/** The source of the `@/…` module a name is imported from (undefined when it is not, or unreadable). */
function importedModuleSource(options: { name: string; sourceText: string }): string | undefined {
  const importMatch = new RegExp(
    `import\\s*\\{[^}]*\\b${options.name}\\b[^}]*\\}\\s*from\\s*'@/([^']+)\\.js'`,
  ).exec(options.sourceText);
  if (!importMatch?.[1]) return undefined;
  try {
    return readFileSync(join(process.cwd(), 'src', `${importMatch[1]}.ts`), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * A matched literal's value as the source means it: escaped quotes and backslashes unescaped and,
 * in a template literal, each `${NAME}` replaced by the string constant it names — declared in the
 * same file (a description built from a shared phrase, `${DAY_CLOSE_FIGURES}`) or imported from an
 * `@/…` module; a name it cannot resolve stays as written.
 */
function literalValue(options: {
  quote: string;
  body: string;
  sourceText: string;
  depth: number;
}): string {
  const { quote, body, sourceText, depth } = options;
  return body.replace(
    ESCAPE_OR_INTERPOLATION_PATTERN,
    (whole, escaped: string | undefined, name: string | undefined) => {
      if (escaped !== undefined) return escaped;
      if (quote !== '`' || name === undefined || depth >= INTERPOLATION_DEPTH_MAX) return whole;
      const constant = resolveStringConstant({ name, sourceText, hops: 0 });
      return constant ? literalValue({ ...constant, depth: depth + 1 }) : whole;
    },
  );
}

/**
 * The string constant a name refers to from a source text: declared there, else followed through
 * its `@/…` import (and that module's own import of it — a re-export) up to two modules away.
 */
function resolveStringConstant(options: {
  name: string;
  sourceText: string;
  hops: number;
}): { quote: string; body: string; sourceText: string } | undefined {
  const { name, sourceText, hops } = options;
  const local = findStringConstant({ name, sourceText });
  if (local) return { ...local, sourceText };
  if (hops >= 2) return undefined;
  const moduleSource = importedModuleSource({ name, sourceText });
  return moduleSource
    ? resolveStringConstant({ name, sourceText: moduleSource, hops: hops + 1 })
    : undefined;
}

function extractMetadataFromOptionsBody(options: {
  optionsBody: string;
  sourceText: string;
}): RouteSchemaMetadata {
  const { optionsBody, sourceText } = options;
  const schemaRange = findSchemaPropertyRange(optionsBody);
  if (!schemaRange) {
    return { summary: null, description: null, tags: null };
  }
  const schemaBody = optionsBody.slice(schemaRange.bodyStart, schemaRange.bodyEnd);
  const summaryMatch = SUMMARY_LITERAL_PATTERN.exec(schemaBody);
  const descriptionMatch = DESCRIPTION_LITERAL_PATTERN.exec(schemaBody);
  const tagsMatch = TAGS_ARRAY_PATTERN.exec(schemaBody);
  const tags = tagsMatch ? extractTagsFromArrayBody(tagsMatch[1] ?? '') : null;
  const literalOf = (match: RegExpExecArray | null): string | null =>
    match?.[1] === undefined || match[2] === undefined
      ? null
      : literalValue({ quote: match[1], body: match[2], sourceText, depth: 0 });
  return {
    summary: literalOf(summaryMatch),
    description: literalOf(descriptionMatch),
    tags: tags && tags.length > 0 ? tags : null,
  };
}

/** True when the route options' `schema` block declares a `params` property (Zod params schema). */
function schemaDeclaresParams(optionsBody: string): boolean {
  const schemaRange = findSchemaPropertyRange(optionsBody);
  if (!schemaRange) return false;
  const schemaBody = optionsBody.slice(schemaRange.bodyStart, schemaRange.bodyEnd);
  return /(?:^|[,{\s])params\s*:/.test(schemaBody);
}

/** True when the route's `schema` block declares a request `body` (drives the request-body map gate). */
function schemaDeclaresBody(optionsBody: string): boolean {
  const schemaRange = findSchemaPropertyRange(optionsBody);
  if (!schemaRange) return false;
  const schemaBody = optionsBody.slice(schemaRange.bodyStart, schemaRange.bodyEnd);
  return /(?:^|[,{\s])body\s*:/.test(schemaBody);
}

/** True when the route's `schema` block declares a `querystring` (drives the query map gate). */
function schemaDeclaresQuerystring(optionsBody: string): boolean {
  const schemaRange = findSchemaPropertyRange(optionsBody);
  if (!schemaRange) return false;
  const schemaBody = optionsBody.slice(schemaRange.bodyStart, schemaRange.bodyEnd);
  return /(?:^|[,{\s])querystring\s*:/.test(schemaBody);
}

/** A single route registration paired with its (possibly incomplete) extracted schema metadata. */
export interface RouteSchemaEntry {
  method: string;
  fullPath: string;
  /** `${METHOD} ${OPENAPI_PATH}` lookup key (Fastify `:param` → OpenAPI `{param}`). */
  lookupKey: string;
  metadata: RouteSchemaMetadata;
  /**
   * True when the route declares `schema.params` (drives the `:param` completeness gate). Optional so
   * older fixtures stay valid; the extractor always populates it, and a missing value is treated as
   * "no params schema".
   */
  hasParamsSchema?: boolean;
  /**
   * True when the route declares `schema.body` — the OpenAPI document reads request bodies from
   * `routeSchemaMap` (`tooling/openapi/schema-map.ts`), so each such route needs its entry there.
   */
  hasBodySchema?: boolean;
  /**
   * True when the route declares `schema.querystring` — the OpenAPI document reads query parameters
   * from `routeQuerySchemaMap` (`tooling/openapi/query-schema-map.ts`), so each such route needs its
   * entry there (a record delete's `reason` / `note`, launch D83 (6)).
   */
  hasQuerySchema?: boolean;
}

function scanRouteSchemaEntries({
  absolutePath,
  prefix,
}: {
  absolutePath: string;
  prefix: string;
}): RouteSchemaEntry[] {
  const entries: RouteSchemaEntry[] = [];
  let sourceText: string;
  try {
    sourceText = readFileSync(absolutePath, 'utf-8');
  } catch {
    return entries;
  }

  for (const methodMatch of sourceText.matchAll(ROUTE_METHOD_PATTERN_BROAD)) {
    const method = methodMatch[1]?.toUpperCase();
    if (!method) continue;
    const matchIndex = methodMatch.index ?? 0;
    const afterMethod = sourceText.slice(matchIndex);
    const pathMatch = ROUTE_PATH_PATTERN.exec(afterMethod);
    const routePath = pathMatch?.[1];
    if (!routePath) continue;
    const normalizedPath =
      routePath === '/' ? '' : routePath.startsWith('/') ? routePath : `/${routePath}`;
    const fullPath = `${prefix}${normalizedPath}`.replace(/\/+/g, '/');

    const optionsRange = findOptionsObjectRange(sourceText, matchIndex);
    if (!optionsRange) continue;
    const optionsBody = sourceText.slice(optionsRange.bodyStart, optionsRange.bodyEnd);
    const metadata = extractMetadataFromOptionsBody({ optionsBody, sourceText });
    entries.push({
      method,
      fullPath,
      lookupKey: buildLookupKey(method, fullPath),
      metadata,
      hasParamsSchema: schemaDeclaresParams(optionsBody),
      hasBodySchema: schemaDeclaresBody(optionsBody),
      hasQuerySchema: schemaDeclaresQuerystring(optionsBody),
    });
  }

  return entries;
}

function collectAllEntries(): RouteSchemaEntry[] {
  const entries: RouteSchemaEntry[] = [];
  for (const routeFileAbsolutePath of listDomainRouteFiles()) {
    const domainPrefix = inferDomainPrefixForFile(routeFileAbsolutePath);
    if (!domainPrefix) continue;
    entries.push(
      ...scanRouteSchemaEntries({ absolutePath: routeFileAbsolutePath, prefix: domainPrefix }),
    );
  }
  for (const supplementalFile of SUPPLEMENTAL_ROUTE_FILES) {
    entries.push(...scanRouteSchemaEntries(supplementalFile));
  }
  return entries;
}

/**
 * Every route registration with its (possibly incomplete) schema metadata —
 * including routes that declare no `summary`/`description`/`tags` at all.
 *
 * @remarks Used by the `validate:route-schema-docs` gate to flag undocumented
 * routes; {@link collectRouteSchemaMetadata} filters empty entries out, so it
 * cannot surface a route that is missing every field.
 */
export function collectAllRouteSchemaEntries(): RouteSchemaEntry[] {
  return collectAllEntries();
}

/** Map of `${METHOD} ${OPENAPI_PATH}` → schema metadata for routes that declare at least one of summary/description/tags. */
export function collectRouteSchemaMetadata(): Map<string, RouteSchemaMetadata> {
  const metadataByLookupKey = new Map<string, RouteSchemaMetadata>();
  for (const entry of collectAllEntries()) {
    if (entry.metadata.summary || entry.metadata.description || entry.metadata.tags) {
      metadataByLookupKey.set(entry.lookupKey, entry.metadata);
    }
  }
  return metadataByLookupKey;
}
