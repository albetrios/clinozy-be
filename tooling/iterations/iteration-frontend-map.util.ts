/**
 * The frontend route map behind `pnpm iteration:frontend-map` — `plans/frontend-route-map.md` in an
 * iteration: what the frontend needs to move from the design drop to the built API.
 *
 * Sections 1, 2 and 4 of the map (the contract changes, each design operation's route, the design
 * features the backend dropped) are written by hand. Section 3, every available route, is generated
 * here between the {@link GENERATED_BLOCK_START} and {@link GENERATED_BLOCK_END} markers, from the
 * route catalog (`docs/routes.txt`), the OpenAPI document's summaries and the iteration's route
 * review (`plans/routes-final.md`), so the list never drifts from the code.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ITERATIONS_DIRECTORY,
  readIterationReadme,
  readIterationTemplate,
  renderTemplate,
} from './iteration.util.js';

/** The map's file name inside an iteration's `plans/`. */
export const FRONTEND_ROUTE_MAP_FILE = 'frontend-route-map.md';

/** The route review the `#` column reads, inside an iteration's `plans/`. */
export const ROUTE_REVIEW_FILE = 'routes-final.md';

/** Opens the generated block of the map. */
export const GENERATED_BLOCK_START = '<!-- GENERATED:START -->';

/** Closes the generated block of the map. */
export const GENERATED_BLOCK_END = '<!-- GENERATED:END -->';

/** The Status that refuses a rewrite: a frozen iteration is never edited (`iterations/README.md`). */
const FROZEN_STATUS = 'frozen';

/** The public API prefix the catalog prints and the map drops. */
const API_PREFIX = '/api/v1';

/** Summaries for the routes the OpenAPI document leaves out or names by their path only. */
const SUMMARY_FALLBACKS: Readonly<Record<string, string>> = {
  'GET /internal/ops/circuit-breakers': 'List the outbound circuit breakers (operations only)',
  'POST /internal/ops/circuit-breakers/:circuit_name/reset':
    'Reset one circuit breaker (operations only)',
  'GET /metrics': 'Prometheus metrics (operations only)',
  'GET /livez': 'Liveness probe',
  'GET /readyz': 'Readiness probe',
};

/** One route of `docs/routes.txt`. */
export interface CatalogRoute {
  /** `GET`, `POST`, `PATCH`, `PUT` or `DELETE`. */
  readonly method: string;
  /** The path without `/api/v1`, with `:param` segments. */
  readonly path: string;
  /** Whether `X-Idempotency-Key` is required (`req`). */
  readonly isIdempotencyRequired: boolean;
  /** Whether the route refuses a personal organization (`team`). */
  readonly isTeamOnly: boolean;
  /** The catalog's gate column: `PERM: <code>`, `AUTH`, `PUBLIC`, `ROLE: …` or `TOKEN: …`. */
  readonly gate: string;
}

/** The part of an OpenAPI document the map reads. */
export interface OpenApiSummarySource {
  /** OpenAPI paths (`{param}` segments) → method → operation. */
  readonly paths: Readonly<Record<string, Readonly<Record<string, { readonly summary?: string }>>>>;
}

/** One module of the generated list: its heading and the paths it holds. */
interface RouteModule {
  readonly name: string;
  readonly holds: (path: string) => boolean;
}

/** The modules of the generated list, in order; the last one takes every route left. */
const ROUTE_MODULES: readonly RouteModule[] = [
  {
    name: 'Session and account',
    holds: (path) => path.startsWith('/auth/') || path.startsWith('/users/me'),
  },
  {
    name: 'Organization and team',
    holds: (path) =>
      path.startsWith('/tenancy/') ||
      path.startsWith('/app/memberships') ||
      path.startsWith('/app/roles'),
  },
  { name: 'Branches and places', holds: (path) => path.startsWith('/app/branches') },
  {
    name: 'Offerings',
    holds: (path) => /^\/app\/(offering-groups|offerings|offers)(\/|$)/.test(path),
  },
  {
    name: 'Contacts and messaging',
    holds: (path) =>
      /^\/app\/(contacts|contact-activities|contact-message-templates|messaging-webhook)(\/|$)/.test(
        path,
      ),
  },
  { name: 'Leads', holds: (path) => path.startsWith('/app/leads') },
  { name: 'Appointments', holds: (path) => path.startsWith('/app/appointments') },
  {
    name: 'Patients',
    holds: (path) => /^\/app\/(patients|patient-[a-z-]+|prescription-kits)(\/|$)/.test(path),
  },
  {
    name: 'Billing — invoices, payments, credits, day close',
    holds: (path) =>
      /^\/app\/(invoices|invoice-credit-notes|payments|pending-credits|day-closes)(\/|$)/.test(
        path,
      ),
  },
  { name: 'Clinic stock', holds: (path) => path.startsWith('/app/stock-') },
  { name: 'Tasks', holds: (path) => /^\/app\/(tasks|task-rule-settings)(\/|$)/.test(path) },
  {
    name: 'Medical store',
    holds: (path) =>
      /^\/app\/(manufacturers|suppliers|supplier-credits|medicines|medical-[a-z-]+)(\/|$)/.test(
        path,
      ),
  },
  { name: 'Files', holds: (path) => path.startsWith('/uploads') },
  { name: 'Notifications and webhooks', holds: (path) => path.startsWith('/notify/') },
  { name: 'Subscription billing (the platform)', holds: (path) => path.startsWith('/billing/') },
  { name: 'Platform administration and operations', holds: () => true },
];

const CATALOG_ROUTE_LINE =
  /^ {2}(GET|POST|PATCH|PUT|DELETE) +(\/\S+) +\d{3} +(req|-) +(both|team) +(.+)$/;
const REVIEW_SECTION_HEADING = /^## (\d+)\. /;
const REVIEW_ROUTE_ROW = /^\| ([0-9.]+) \| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/;

/**
 * Reads every route of `docs/routes.txt`, from its domain sections (the summary after them repeats
 * routes and is skipped).
 *
 * @remarks
 * Paths lose the `/api/v1` prefix; the health and operations routes keep their own root paths.
 */
export function parseRouteCatalog(catalog: string): CatalogRoute[] {
  const routes: CatalogRoute[] = [];
  for (const line of catalog.split('\n')) {
    if (line.trim() === 'SUMMARY') break;
    const match = CATALOG_ROUTE_LINE.exec(line.trimEnd());
    if (!match) continue;
    const [, method, path, idempotency, scope, gate] = match;
    if (!(method && path && gate)) continue;
    routes.push({
      method,
      path: path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path,
      isIdempotencyRequired: idempotency === 'req',
      isTeamOnly: scope === 'team',
      gate: gate.trim(),
    });
  }
  return routes;
}

/**
 * Reads the route review's route tables into `METHOD path` → its number (`5.3` — sub-domain 5,
 * route 3), with `{param}` segments written `:param` as the catalog writes them.
 *
 * @remarks
 * The first table that names a route wins: a sub-domain's summary table and its nested sections
 * number a route the same way.
 */
export function parseRouteReviewNumbers(review: string): ReadonlyMap<string, string> {
  const numbers = new Map<string, string>();
  let section = '';
  for (const line of review.split('\n')) {
    const heading = REVIEW_SECTION_HEADING.exec(line);
    if (heading?.[1]) {
      section = heading[1];
      continue;
    }
    const row = REVIEW_ROUTE_ROW.exec(line);
    if (!(row?.[1] && row[2] && row[3]) || section === '') continue;
    const key = `${row[2]} ${row[3].replace(/\{([a-z_]+)\}/g, ':$1')}`;
    if (numbers.has(key)) continue;
    numbers.set(key, row[1].includes('.') ? row[1] : `${section}.${row[1]}`);
  }
  return numbers;
}

/**
 * The route review number of a catalog route, or `''` when the review does not name it.
 *
 * @remarks
 * The review writes the clinic's routes without `/app` and the team routes without `/tenancy`, so
 * both spellings are tried.
 */
export function routeReviewNumber(lookup: {
  readonly numbers: ReadonlyMap<string, string>;
  readonly route: Pick<CatalogRoute, 'method' | 'path'>;
}): string {
  const { method, path } = lookup.route;
  const spellings = [path];
  if (path.startsWith('/app/')) spellings.push(path.slice('/app'.length));
  if (path.startsWith('/tenancy/')) spellings.push(path.slice('/tenancy'.length));
  for (const spelling of spellings) {
    const number = lookup.numbers.get(`${method} ${spelling}`);
    if (number !== undefined) return number;
  }
  return '';
}

/**
 * Reads the OpenAPI document's operation summaries into `METHOD path` → summary, in the catalog's
 * spelling (no `/api/v1`, `:param` segments).
 *
 * @remarks
 * The routes the document leaves out, or names only by their path, take a fixed fallback.
 */
export function openApiSummaries(document: OpenApiSummarySource): ReadonlyMap<string, string> {
  const summaries = new Map<string, string>(Object.entries(SUMMARY_FALLBACKS));
  for (const [openApiPath, operations] of Object.entries(document.paths)) {
    const path = openApiPath
      .replace(/\{([a-z_]+)\}/g, ':$1')
      .replace(new RegExp(`^${API_PREFIX}`), '');
    for (const [method, operation] of Object.entries(operations)) {
      const key = `${method.toUpperCase()} ${path}`;
      const summary = operation.summary?.trim() ?? '';
      if (summary === '' || summaries.has(key)) continue;
      summaries.set(key, summary);
    }
  }
  return summaries;
}

function gateText(gate: string): string {
  if (gate.startsWith('PERM: ')) return `\`${gate.slice('PERM: '.length)}\``;
  if (gate === 'AUTH') return 'signed in';
  if (gate === 'PUBLIC') return 'public';
  if (gate.startsWith('ROLE: ')) return 'platform admin';
  if (gate.startsWith('TOKEN: ')) return `token (${gate.slice('TOKEN: '.length)})`;
  return gate;
}

function headingAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
}

function tableCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * Renders section 3's generated block: the route count, a module index and one table per module
 * (method, path, gate, idempotency, team-only, route review number, what it does).
 *
 * @remarks
 * Pure: the same catalog, summaries and review give the same text, which is what `--check` compares.
 */
export function renderRouteSection(source: {
  readonly routes: readonly CatalogRoute[];
  readonly summaries: ReadonlyMap<string, string>;
  readonly reviewNumbers: ReadonlyMap<string, string>;
}): string {
  const grouped = new Map<string, CatalogRoute[]>(ROUTE_MODULES.map((module) => [module.name, []]));
  for (const route of source.routes) {
    const module = ROUTE_MODULES.find((candidate) => candidate.holds(route.path));
    if (module) grouped.get(module.name)?.push(route);
  }
  const clinicRouteCount = source.routes.filter((route) => route.path.startsWith('/app/')).length;
  const lines = [
    `${source.routes.length} routes, ${clinicRouteCount} of them the clinic's under \`/api/v1/app\`, from \`docs/routes.txt\`.`,
    'Paths drop `/api/v1`; the health and operations routes in the last module sit outside it.',
    '**Gate**: a permission code, `signed in`, `public`, `platform admin` or a token. **Idem** `req`:',
    '`X-Idempotency-Key` required. **Team** `team`: team organizations only (`422` on a personal one).',
    '**#**: the route review number (blank where the review does not name the route). Success is `200`,',
    'or `204` for a `DELETE`. **What it does** is the OpenAPI summary.',
    '',
    '| Module | Routes |',
    '| --- | --- |',
  ];
  for (const module of ROUTE_MODULES) {
    lines.push(
      `| [${module.name}](#${headingAnchor(module.name)}) | ${grouped.get(module.name)?.length ?? 0} |`,
    );
  }
  for (const module of ROUTE_MODULES) {
    lines.push('', `### ${module.name}`, '');
    lines.push('| Method | Path | Gate | Idem | Team | # | What it does |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const route of grouped.get(module.name) ?? []) {
      const summary = source.summaries.get(`${route.method} ${route.path}`) ?? '';
      const number = routeReviewNumber({ numbers: source.reviewNumbers, route });
      lines.push(
        `| ${route.method} | \`${route.path}\` | ${gateText(route.gate)} | ${route.isIdempotencyRequired ? 'req' : ''} | ${route.isTeamOnly ? 'team' : ''} | ${number} | ${tableCell(summary)} |`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * Puts `block` between the map's generated markers, keeping everything outside them.
 *
 * @remarks
 * Failure modes: throws when the markers are missing or out of order — the hand-written sections are
 * never overwritten.
 */
export function spliceGeneratedBlock(source: {
  readonly document: string;
  readonly block: string;
}): string {
  const start = source.document.indexOf(GENERATED_BLOCK_START);
  const end = source.document.indexOf(GENERATED_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `The map has no ${GENERATED_BLOCK_START} … ${GENERATED_BLOCK_END} block — add the two markers where section 3 goes.`,
    );
  }
  return `${source.document.slice(0, start + GENERATED_BLOCK_START.length)}\n\n${source.block}\n\n${source.document.slice(end)}`;
}

/** Parsed `pnpm iteration:frontend-map` arguments. */
export interface FrontendMapArguments {
  /** The iteration whose `plans/frontend-route-map.md` is written. */
  readonly iteration: string;
  /** `--check`: compare only, write nothing, fail when the map is stale. */
  readonly isCheck: boolean;
}

/**
 * Parses `<iteration> [--check]`.
 *
 * @remarks
 * Failure modes: throws on a missing iteration, a second one or an unknown flag.
 */
export function parseFrontendMapArguments(commandLine: readonly string[]): FrontendMapArguments {
  const positional = commandLine.filter((argument) => !argument.startsWith('--'));
  const flags = commandLine.filter((argument) => argument.startsWith('--'));
  const unknown = flags.filter((flag) => flag !== '--check');
  if (unknown.length > 0) throw new Error(`Unknown option ${unknown.join(', ')}.`);
  const [iteration, extra] = positional;
  if (iteration === undefined || extra !== undefined) {
    throw new Error('Name one iteration: pnpm iteration:frontend-map <iteration> [--check].');
  }
  return { iteration, isCheck: flags.includes('--check') };
}

/** What `pnpm iteration:frontend-map` decided to write. */
export interface FrontendMapPlan {
  /** The map's path. */
  readonly path: string;
  /** The map with its generated block refreshed. */
  readonly content: string;
  /** Whether `content` differs from the file on disk (or the file is new). */
  readonly isChanged: boolean;
  /** Whether the file did not exist and `content` comes from the template. */
  readonly isNew: boolean;
}

/** The route review of an iteration, or `''` when it has none. */
export function readRouteReview(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string {
  const path = join(
    location.repositoryRoot,
    ITERATIONS_DIRECTORY,
    location.iteration,
    'plans',
    ROUTE_REVIEW_FILE,
  );
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

/**
 * Decides the refreshed map of an iteration without writing it: the existing file with a new
 * generated block, or — the first time — the template with one.
 *
 * @remarks
 * Failure modes: throws for an unknown iteration, and for a frozen one unless only checking (a frozen
 * iteration is never edited; a later iteration carries its own map).
 */
export function planFrontendRouteMap(request: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly block: string;
  readonly isCheck: boolean;
}): FrontendMapPlan {
  const { fields } = readIterationReadme(request);
  if (!request.isCheck && fields.get('Status') === FROZEN_STATUS) {
    throw new Error(
      `${request.iteration} is frozen — it is never edited; regenerate the map in the iteration that follows it.`,
    );
  }
  const path = join(
    request.repositoryRoot,
    ITERATIONS_DIRECTORY,
    request.iteration,
    'plans',
    FRONTEND_ROUTE_MAP_FILE,
  );
  const isNew = !existsSync(path);
  const current = isNew
    ? renderTemplate({
        template: readIterationTemplate(FRONTEND_ROUTE_MAP_FILE),
        values: { name: request.iteration },
      })
    : readFileSync(path, 'utf-8');
  const content = spliceGeneratedBlock({ document: current, block: request.block });
  return { path, content, isChanged: isNew || content !== current, isNew };
}
