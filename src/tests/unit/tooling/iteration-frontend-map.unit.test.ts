/**
 * Design-iteration tooling — `pnpm iteration:frontend-map` (`tooling/iterations/iteration-frontend-map.util.ts`).
 *
 * Pins the route catalog parser (its summary section skipped), the route review numbers and their
 * two spellings, the OpenAPI summaries with their fallbacks, the generated section (modules, gates,
 * flags, escaped pipes), the splice that keeps the hand-written sections, the arguments, and the
 * plan: a new map from the template, an unchanged one, and a frozen iteration refused.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  removeIterationRepositories,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  GENERATED_BLOCK_END,
  GENERATED_BLOCK_START,
  openApiSummaries,
  parseFrontendMapArguments,
  parseRouteCatalog,
  parseRouteReviewNumbers,
  planFrontendRouteMap,
  renderRouteSection,
  routeReviewNumber,
  spliceGeneratedBlock,
} from '@tooling/iterations/iteration-frontend-map.util.js';

afterEach(() => {
  removeIterationRepositories();
});

const ITERATION = 'launch-2026-09-30-jxmr';

const CATALOG = `================================================================================
  DOMAIN: APP (/api/v1/app)
  Routes: 3
================================================================================

  — Sub Domains —
  GET    /api/v1/app/leads                                        200  -    both  PERM: lead:read
  POST   /api/v1/app/leads                                        200  req  both  PERM: lead:create
  POST   /api/v1/tenancy/organization/roles                       200  req  team  PERM: role:create
  POST   /api/v1/auth/login                                       200  -    both  PUBLIC
  GET    /livez                                                   200  -    both  PUBLIC

================================================================================
  SUMMARY
================================================================================

  GET    /api/v1/app/leads                                        200  -    both  PERM: lead:read
`;

const REVIEW = `# Final routes

## 2. Team — final

| # | Method | Path | Operation | Access | Idem |
| --- | --- | --- | --- | --- | --- |
| 9 | POST | \`/organization/roles\` | Add a role | \`role:create\` | req |

## 5. Leads — final

| # | Method | Path | Operation | Access | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | \`/leads\` | List leads | \`lead:read\` | |
| 3 | POST | \`/leads\` | Add a lead | \`lead:create\` | req |
| 4 | GET | \`/leads/{lead_id}\` | Get a lead | \`lead:read\` | |

### 5.A Nested

| # | Method | Path | Operation | Access | Idem |
| --- | --- | --- | --- | --- | --- |
| 7 | GET | \`/leads\` | Repeated in a nested table | \`lead:read\` | |
`;

describe('parseRouteCatalog', () => {
  it('reads the domain sections, drops /api/v1 and stops at the summary', () => {
    const routes = parseRouteCatalog(CATALOG);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /app/leads',
      'POST /app/leads',
      'POST /tenancy/organization/roles',
      'POST /auth/login',
      'GET /livez',
    ]);
    expect(routes[1]).toMatchObject({ isIdempotencyRequired: true, isTeamOnly: false });
    expect(routes[2]).toMatchObject({ isTeamOnly: true, gate: 'PERM: role:create' });
  });
});

describe('route review numbers', () => {
  it('numbers each route by its sub-domain, with :param segments; the first table wins', () => {
    const numbers = parseRouteReviewNumbers(REVIEW);
    expect(numbers.get('GET /leads')).toBe('5.1');
    expect(numbers.get('GET /leads/:lead_id')).toBe('5.4');
    expect(numbers.get('POST /organization/roles')).toBe('2.9');
  });

  it('finds a clinic route without /app and a team route without /tenancy; blank when unnamed', () => {
    const numbers = parseRouteReviewNumbers(REVIEW);
    expect(routeReviewNumber({ numbers, route: { method: 'POST', path: '/app/leads' } })).toBe(
      '5.3',
    );
    expect(
      routeReviewNumber({
        numbers,
        route: { method: 'POST', path: '/tenancy/organization/roles' },
      }),
    ).toBe('2.9');
    expect(routeReviewNumber({ numbers, route: { method: 'POST', path: '/auth/login' } })).toBe('');
  });
});

describe('openApiSummaries', () => {
  it('keys by method and catalog path, skips empty summaries and keeps the fallbacks', () => {
    const summaries = openApiSummaries({
      paths: {
        '/api/v1/app/leads/{lead_id}': { get: { summary: 'Get lead' }, patch: { summary: ' ' } },
        '/livez': { get: { summary: 'GET /livez' } },
      },
    });
    expect(summaries.get('GET /app/leads/:lead_id')).toBe('Get lead');
    expect(summaries.has('PATCH /app/leads/:lead_id')).toBe(false);
    expect(summaries.get('GET /livez')).toBe('Liveness probe');
    expect(summaries.get('GET /metrics')).toBe('Prometheus metrics (operations only)');
  });
});

describe('renderRouteSection', () => {
  it('groups routes into modules with their gate, flags, review number and escaped summary', () => {
    const block = renderRouteSection({
      routes: parseRouteCatalog(CATALOG),
      summaries: new Map([
        ['POST /app/leads', 'Create lead | or contact'],
        ['POST /auth/login', 'Login with email and password'],
      ]),
      reviewNumbers: parseRouteReviewNumbers(REVIEW),
    });
    expect(block).toMatch(/^5 routes, 2 of them the clinic's/);
    expect(block).toContain('| [Leads](#leads) | 2 |');
    expect(block).toContain(
      '| POST | `/app/leads` | `lead:create` | req |  | 5.3 | Create lead \\| or contact |',
    );
    expect(block).toContain(
      '| POST | `/tenancy/organization/roles` | `role:create` | req | team | 2.9 |  |',
    );
    expect(block).toContain(
      '| POST | `/auth/login` | public |  |  |  | Login with email and password |',
    );
    expect(block.indexOf('### Platform administration and operations')).toBeLessThan(
      block.indexOf('| GET | `/livez` |'),
    );
  });
});

describe('spliceGeneratedBlock', () => {
  it('replaces only what sits between the markers', () => {
    const document = `# Map\n\nhand\n\n${GENERATED_BLOCK_START}\nold\n${GENERATED_BLOCK_END}\n\nafter\n`;
    expect(spliceGeneratedBlock({ document, block: 'new' })).toBe(
      `# Map\n\nhand\n\n${GENERATED_BLOCK_START}\n\nnew\n\n${GENERATED_BLOCK_END}\n\nafter\n`,
    );
  });

  it('refuses a map without the markers', () => {
    expect(() => spliceGeneratedBlock({ document: '# Map\n', block: 'new' })).toThrow(
      /no <!-- GENERATED:START -->/,
    );
  });
});

describe('parseFrontendMapArguments', () => {
  it('takes one iteration and --check', () => {
    expect(parseFrontendMapArguments([ITERATION])).toEqual({
      iteration: ITERATION,
      isCheck: false,
    });
    expect(parseFrontendMapArguments([ITERATION, '--check'])).toEqual({
      iteration: ITERATION,
      isCheck: true,
    });
  });

  it('refuses no iteration, two, or an unknown option', () => {
    expect(() => parseFrontendMapArguments([])).toThrow(/Name one iteration/);
    expect(() => parseFrontendMapArguments([ITERATION, 'another'])).toThrow(/Name one iteration/);
    expect(() => parseFrontendMapArguments([ITERATION, '--write'])).toThrow(
      /Unknown option --write/,
    );
  });
});

describe('planFrontendRouteMap', () => {
  it('starts a missing map from the template, with the block in place', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: ITERATION });
    const plan = planFrontendRouteMap({
      repositoryRoot,
      iteration: ITERATION,
      block: 'the routes',
      isCheck: false,
    });
    expect(plan).toMatchObject({ isNew: true, isChanged: true });
    expect(plan.content).toContain(`# Frontend route map — ${ITERATION}`);
    expect(plan.content).toContain(
      `${GENERATED_BLOCK_START}\n\nthe routes\n\n${GENERATED_BLOCK_END}`,
    );
  });

  it('reports an up-to-date map as unchanged', () => {
    const repositoryRoot = createIterationRepository();
    const folder = addTestIteration({ repositoryRoot, name: ITERATION });
    mkdirSync(join(folder, 'plans'), { recursive: true });
    writeFileSync(
      join(folder, 'plans', 'frontend-route-map.md'),
      `# Map\n\n${GENERATED_BLOCK_START}\n\nthe routes\n\n${GENERATED_BLOCK_END}\n`,
    );
    const plan = planFrontendRouteMap({
      repositoryRoot,
      iteration: ITERATION,
      block: 'the routes',
      isCheck: true,
    });
    expect(plan).toMatchObject({ isNew: false, isChanged: false });
  });

  it('refuses to rewrite a frozen iteration, but still checks it', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: ITERATION, fields: { status: 'frozen' } });
    expect(() =>
      planFrontendRouteMap({ repositoryRoot, iteration: ITERATION, block: 'x', isCheck: false }),
    ).toThrow(/is frozen/);
    expect(
      planFrontendRouteMap({ repositoryRoot, iteration: ITERATION, block: 'x', isCheck: true })
        .isChanged,
    ).toBe(true);
  });
});
