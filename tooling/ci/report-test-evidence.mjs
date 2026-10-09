#!/usr/bin/env node
/**
 * Builds an auditable test ledger from Vitest and Playwright JSON reporters.
 * Scores describe evidence strength, including failures, never success probability.
 * Real-provider and route coverage require explicit, reviewable manifest evidence.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: node tooling/ci/report-test-evidence.mjs [options]
  --vitest FILE            Vitest JSON reporter output (repeatable)
  --playwright FILE        Playwright JSON reporter output (repeatable)
  --manifest FILE          JSON with runs, evidence, providers and routeMappings
  --root DIRECTORY         Repository root (default: current directory)
  --revision SHA           Revision of supplied runs; not inferred from checkout
  --observed-at TIMESTAMP  Execution time of supplied runs; not report creation time
  --freshness VALUE        current, historical or unspecified (default: unspecified)
  --output FILE            New Markdown report; existing files are never overwritten
  --json-output FILE       Optional new machine-readable ledger
  --help                   Show this help

Manifest run: {path, format: "vitest"|"playwright", revision, observedAt,
  freshness, section?, layer?, providers?, providerMode?, caveats?}
Manual evidence: {name, section, status: "PASS"|"FAIL"|"NOT RUN", artifact,
  revision, observedAt, freshness, layer, providers?, providerMode?, kind?,
  assertion, caveats?}. Only providerMode: "real-provider" proves real transport.
Route mapping: {method, path, testId, kind: "positive"|"negative"|"recovery",
  dimension: "positive"|"authentication"|"tenant"|"validation"|"recovery",
  source}. A literal in a test file alone is not runtime route coverage.
Provider supplement: {id, name?, gaps?, sourceLocations?}.
Missing results and ambiguous case names remain explicit gaps.
`;

const PROVIDERS = [
  { id: 'stripe', name: 'Stripe', pattern: /\bstripe\b/i },
  { id: 'resend', name: 'Resend', pattern: /\bresend\b/i },
  {
    id: 's3',
    name: 'AWS S3 / S3-compatible storage',
    pattern: /\bs3\b|s3-adapter|object-storage/i,
  },
  { id: 'google-oauth', name: 'Google OAuth', pattern: /google[-_/ ]?oauth|oauth[-_/ ]?google/i },
  { id: 'github-oauth', name: 'GitHub OAuth', pattern: /github[-_/ ]?oauth|oauth[-_/ ]?github/i },
  { id: 'turnstile', name: 'Cloudflare Turnstile', pattern: /turnstile/i },
  { id: 'sentry', name: 'Sentry', pattern: /\bsentry\b/i },
  { id: 'posthog', name: 'PostHog', pattern: /\bposthog\b/i },
  {
    id: 'outbound-webhook',
    name: 'Outbound webhook receiver',
    pattern: /webhook[-_/ ]?(delivery|request-id-forward)|outbound[-_/ ]?webhook/i,
  },
];
const STATUSES = new Set(['PASS', 'FAIL', 'NOT RUN']);
const FRESHNESS = new Set(['current', 'historical', 'unspecified']);

function parseArguments(argumentsList) {
  const options = { root: process.cwd(), runs: [], freshness: 'unspecified' };
  for (let index = 0; index < argumentsList.length; index++) {
    const flag = argumentsList[index];
    if (flag === '--help') return { help: true };
    const value = argumentsList[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--vitest' || flag === '--playwright') {
      options.runs.push({ path: value, format: flag.slice(2) });
    } else if (
      [
        '--root',
        '--revision',
        '--observed-at',
        '--freshness',
        '--manifest',
        '--output',
        '--json-output',
      ].includes(flag)
    ) {
      options[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!FRESHNESS.has(options.freshness)) throw new Error('Invalid freshness');
  if (!options.output) throw new Error('--output is required');
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSensitiveKey(key) {
  return /^(?:authorization|proxyauthorization|cookie|setcookie|apikey|xapikey|token|accesstoken|refreshtoken|idtoken|csrftoken|xcsrftoken|xsrftoken|xxsrftoken|session|sessionid|clientsecret|secret|password|passwd|privatekey|awsaccesskeyid|awssecretaccesskey|awssessiontoken)$/i.test(
    String(key).replace(/[-_]/g, ''),
  );
}

function mask(value) {
  return String(value ?? '')
    .replace(
      /\b(?:gh[pousr]_[A-Za-z\d]{20,}|github_pat_[A-Za-z\d_]{20,}|(?:AKIA|ASIA)[A-Z\d]{16})\b/g,
      '[REDACTED]',
    )
    .replace(
      /(?:sk|rk|pk)_(?:test|live)_[\w-]+|whsec_[\w-]+|re_[A-Za-z\d]{16,}|phc_[\w-]+/g,
      '[REDACTED]',
    )
    .replace(/Bearer\s+[\w.+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /(\b(?:proxy[-_]?authorization|authorization|cookie|set-cookie|x-api-key|x-csrf-token|x-xsrf-token)\s*:\s*)[^\r\n]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /((?:["']?)(?:api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|csrf[-_]?token|xsrf[-_]?token|session(?:[-_]?id)?|client[-_]?secret|secret|token|password|passwd|private[-_]?key|aws[-_]?secret[-_]?access[-_]?key|aws[-_]?session[-_]?token)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s;,&#}\]]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED JWT]')
    .replace(/(https?:\/\/|postgres(?:ql)?:\/\/|redis:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[REDACTED]@')
    .replace(/[A-Z\d._%+-]+@[A-Z\d.-]+\.[A-Z]{2,}/gi, '[REDACTED EMAIL]')
    .replace(/([?&](?:token|secret|key|signature|password|code)=)[^\s&#]+/gi, '$1[REDACTED]');
}

function cell(value) {
  return mask(Array.isArray(value) ? value.join('; ') : value)
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function table({ headers, rows }) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function caseKind(name) {
  if (
    /\brecover(?:s|y|ed)?\b|\bretr(?:y|ies)\b|\breplay\b|\bredeliver|\bresume(?:s)?\b|\bidempotent\b|\bdeduplicat/i.test(
      name,
    )
  )
    return 'recovery';
  if (
    /\breject(?:s|ed)?\b|\bden(?:y|ies|ied)\b|\bforbidden\b|\bunauthorized\b|\binvalid\b|\bfail[- ]closed\b|\bnegative\b|\bthrows\b/i.test(
      name,
    )
  )
    return 'negative';
  if (
    /\bhappy[- ]path\b|\bpositive\b|\bsuccess(?:fully|ful)?\b|\bsucceeds\b|\baccepts\b|\ballows\b/i.test(
      name,
    )
  )
    return 'positive';
  return 'unclassified';
}

function inferSection(file) {
  if (/\.chaos\.test\./.test(file)) return 'Chaos / failure injection';
  if (/\.contract\.test\./.test(file)) return 'Third-party simulated contracts';
  if (/\.property\.test\./.test(file)) return 'Property invariants';
  if (/\.global\.test\./.test(file)) return 'Global architecture / policy';
  if (/\.db\.unit\.test\.|\.rls-role\.test\./.test(file)) return 'Database / RLS';
  if (/\.integration\.test\./.test(file)) return 'Integration';
  if (/\.e2e\.test\.|\/__tests__\/[^/]+\.test\./.test(file)) return 'Functional journeys';
  return 'Unit / other';
}

function inferLayer({ section, format }) {
  if (format === 'playwright') return 'real browser / local backend';
  if (/contract|Unit|Global|Property/i.test(section)) return 'simulated / in-process';
  return 'isolated local runtime';
}

function evidenceScore({ status, freshness, provenanceKnown, layer }) {
  if (status === 'NOT RUN') return 0;
  if (freshness !== 'current' || !provenanceKnown) return 1;
  if (/source|inventory/i.test(layer)) return 1;
  if (/simulated|fixture|in-process/i.test(layer)) return 2;
  return [
    'isolated local runtime',
    'real browser / local backend',
    'real browser + Playwright HTTP / local backend',
    'real browser / real-provider sandbox',
    'real-provider read-only transport',
    'real-provider public HTTPS / local backend',
    'real-provider public HTTPS / local queue',
  ].includes(layer)
    ? 3
    : 1;
}

function makeRow({
  run,
  file,
  name,
  status,
  duration,
  attempts = 1,
  flaky = false,
  assertion = name,
  kind,
  providers,
  caveats = [],
}) {
  const section = run.section || inferSection(file);
  const layer = run.layer || inferLayer({ section, format: run.format });
  const inferredProviders = PROVIDERS.filter((provider) =>
    provider.pattern.test(`${file} ${name}`),
  ).map((provider) => provider.id);
  const associatedProviders = providers || run.providers || inferredProviders;
  const providerMode = run.providerMode || (associatedProviders.length ? 'fixture' : 'none');
  if (!['fixture', 'real-provider', 'none'].includes(providerMode))
    throw new Error(`Invalid provider mode in ${run.path}`);
  if (kind && !['positive', 'negative', 'recovery', 'unclassified'].includes(kind))
    throw new Error(`Invalid case kind in ${run.path}`);
  const freshness = run.freshness || 'unspecified';
  if (!FRESHNESS.has(freshness)) throw new Error(`Invalid freshness in run ${run.path}`);
  const provenanceKnown = Boolean(run.revision && run.observedAt);
  const score = evidenceScore({ status, freshness, provenanceKnown, layer });
  return {
    id: digest(`${run.path}\n${file}\n${name}`).slice(0, 16),
    caseId: digest(`${file}\n${name}`),
    file,
    name,
    section,
    status,
    kind: kind || caseKind(name),
    classificationBasis: kind
      ? 'explicit manifest assertion'
      : 'test name only; assertion not independently reviewed',
    assertion,
    layer,
    providers: associatedProviders,
    providerMode,
    freshness,
    revision: run.revision || 'UNSPECIFIED',
    observedAt: run.observedAt || 'UNSPECIFIED',
    artifact: run.path,
    durationMs: duration ?? null,
    attempts,
    flaky,
    score,
    caveats: [
      ...(run.caveats || []),
      ...caveats,
      ...(!provenanceKnown ? ['Execution revision/time not supplied'] : []),
    ],
  };
}

function vitestRows({ report, run, root }) {
  if (!Array.isArray(report.testResults)) throw new Error(`Not a Vitest JSON report: ${run.path}`);
  const rows = report.testResults.flatMap((suite) => {
    const file = suite.name ? relative(root, resolve(suite.name)).replaceAll('\\', '/') : 'unknown';
    const assertions = suite.assertionResults || [];
    const suiteErrors = [];
    if (
      suite.status === 'failed' &&
      !assertions.some((assertion) => assertion.status === 'failed')
    ) {
      suiteErrors.push(
        makeRow({
          run,
          file,
          name: 'Suite setup/collection/teardown failed outside testcase assertions',
          status: 'FAIL',
          caveats: [
            'This is a suite error; passing testcase assertions do not establish successful suite completion',
          ],
        }),
      );
    }
    const cases = assertions.map((assertion) =>
      makeRow({
        run,
        file,
        name:
          assertion.fullName || [...(assertion.ancestorTitles || []), assertion.title].join(' > '),
        status:
          assertion.status === 'passed'
            ? 'PASS'
            : assertion.status === 'failed'
              ? 'FAIL'
              : 'NOT RUN',
        duration: assertion.duration,
        caveats:
          assertion.status === 'skipped' ||
          assertion.status === 'pending' ||
          assertion.status === 'todo'
            ? [assertion.status]
            : [],
      }),
    );
    return [...suiteErrors, ...cases];
  });
  if (
    (report.success === false ||
      report.numRuntimeErrorTestSuites > 0 ||
      report.numFailedTestSuites > 0 ||
      report.numFailedTests > 0) &&
    !rows.some((row) => row.status === 'FAIL')
  ) {
    rows.push(
      makeRow({
        run,
        file: '[runner]',
        name: 'Vitest runner failed outside testcase assertions',
        status: 'FAIL',
        kind: 'unclassified',
        caveats: [
          'Runner declared failure without a failing case or suite row; passing assertions do not establish successful completion',
        ],
      }),
    );
  }
  return rows;
}

function playwrightStatus(test) {
  if (test.status === 'unexpected') return 'FAIL';
  const last = (test.results || []).at(-1);
  if (!last || last.status === 'skipped') return 'NOT RUN';
  return last.status === 'passed' ? 'PASS' : 'FAIL';
}

function playwrightTestRow({ test, spec, run, file, ancestors }) {
  const results = test.results || [];
  const finalPass = results.at(-1)?.status === 'passed';
  const caveats = [];
  if (test.expectedStatus && test.expectedStatus !== 'passed') {
    caveats.push(`Expected status: ${test.expectedStatus}; not counted as successful assertions`);
  }
  if (test.status === 'flaky') caveats.push('Retry passed after earlier failure');
  return makeRow({
    run,
    file: spec.file || file,
    name: [...ancestors, spec.title, test.projectName || 'default'].join(' > '),
    status: playwrightStatus(test),
    duration: results.reduce((total, result) => total + (result.duration || 0), 0),
    attempts: results.length,
    flaky:
      test.status === 'flaky' ||
      (finalPass && results.some((result) => result.status !== 'passed')),
    caveats,
  });
}

function playwrightRows({ report, run }) {
  if (!Array.isArray(report.suites)) throw new Error(`Not a Playwright JSON report: ${run.path}`);
  function visit({ suites, ancestors = [], file = 'unknown' }) {
    return suites.flatMap((suite) => {
      const suiteFile = suite.file || file;
      const titles =
        suite.title && suite.title !== suiteFile ? [...ancestors, suite.title] : ancestors;
      const rows = (suite.specs || []).flatMap((spec) =>
        (spec.tests || []).map((test) =>
          playwrightTestRow({ test, spec, run, file: suiteFile, ancestors: titles }),
        ),
      );
      return [
        ...rows,
        ...visit({ suites: suite.suites || [], ancestors: titles, file: suiteFile }),
      ];
    });
  }
  const rows = visit({ suites: report.suites });
  if (report.errors?.length) {
    rows.push(
      makeRow({
        run,
        file: '(Playwright runner)',
        name: 'Runner failed outside testcase assertions',
        status: 'FAIL',
        caveats: [
          `${report.errors.length} runner errors; browser execution completeness is not established`,
        ],
      }),
    );
  }
  return rows;
}

function counts(rows) {
  return {
    pass: rows.filter((row) => row.status === 'PASS').length,
    fail: rows.filter((row) => row.status === 'FAIL').length,
    notRun: rows.filter((row) => row.status === 'NOT RUN').length,
    flaky: rows.filter((row) => row.flaky).length,
  };
}

function summaryStatus(rows) {
  const tally = counts(rows);
  return tally.fail
    ? 'FAIL / incomplete'
    : tally.notRun || tally.flaky
      ? 'PARTIAL'
      : rows.length
        ? 'PASS for observed assertions'
        : 'NOT RUN';
}

function weakestScore(rows) {
  const executed = rows.filter((row) => row.status !== 'NOT RUN');
  return executed.length ? Math.min(...executed.map((row) => row.score)) : 0;
}

function summarize({ rows, providers }) {
  const sections = [...new Set(rows.map((row) => row.section))].sort().map((section) => {
    const tests = rows.filter((row) => row.section === section);
    return {
      section,
      ...counts(tests),
      kinds: ['positive', 'negative', 'recovery', 'unclassified'].map(
        (kind) => `${kind}: ${tests.filter((row) => row.kind === kind).length}`,
      ),
      status: summaryStatus(tests),
      score: weakestScore(tests),
      layers: [...new Set(tests.map((row) => row.layer))],
      gaps: [
        'Name classification is not complete positive/negative case coverage',
        ...(tests.some((row) => row.freshness !== 'current')
          ? ['Contains historical or unspecified provenance']
          : []),
        ...(tests.some((row) => row.status !== 'PASS') ? ['Unpassed cases remain'] : []),
      ],
    };
  });
  const providerSections = providers.map((provider) => {
    const tests = rows.filter((row) => row.providers.includes(provider.id));
    const real = tests.filter((row) => row.providerMode === 'real-provider');
    const fixture = tests.filter((row) => row.providerMode !== 'real-provider');
    return {
      ...provider,
      simulated: counts(fixture),
      real: counts(real),
      status: summaryStatus(tests),
      score: weakestScore(tests),
      gaps: [
        ...(provider.gaps || []),
        ...(!real.some((row) => row.status === 'PASS' && row.freshness === 'current')
          ? ['Current real-provider transport not established']
          : []),
        'Covered cases do not establish all provider flows',
      ],
    };
  });
  return { sections, providers: providerSections };
}

function routeMatrix({ root, mappings, rows }) {
  const catalogPath = resolve(root, 'docs/routes.txt');
  if (!existsSync(catalogPath)) return [];
  return [
    ...readFileSync(catalogPath, 'utf8').matchAll(
      /^\s*(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)\s+(\d{3})\s+(\S+)\s+(\S+)\s+(.+)$/gm,
    ),
  ].map((match) => {
    const method = match[1];
    const path = match[2];
    const linked = mappings.filter((mapping) => mapping.method === method && mapping.path === path);
    const dimensions = ['positive', 'authentication', 'tenant', 'validation', 'recovery'].map(
      (dimension) => {
        if (dimension === 'authentication' && match[6] === 'PUBLIC') return 'N/A: public route';
        const evidence = linked.filter(
          (mapping) =>
            mapping.dimension === dimension &&
            mapping.source &&
            rows.some(
              (row) =>
                row.id === mapping.testId && row.status === 'PASS' && row.freshness === 'current',
            ),
        );
        return evidence.length
          ? `${evidence.length} explicit current mappings`
          : 'UNMAPPED: review applicability / evidence';
      },
    );
    return { method, path, authentication: match[6], dimensions };
  });
}

function providerRegistry(supplements) {
  const providers = PROVIDERS.map(({ pattern: _pattern, ...provider }) => provider);
  for (const provider of supplements) {
    const existing = providers.find((entry) => entry.id === provider.id);
    if (existing) Object.assign(existing, provider);
    else providers.push(provider);
  }
  return providers;
}

function declaredAssertionCount(report) {
  if (report.numTotalTests !== undefined) return report.numTotalTests;
  if (!report.stats) return null;
  return ['expected', 'unexpected', 'skipped', 'flaky'].reduce(
    (total, key) => total + (report.stats[key] ?? 0),
    0,
  );
}

function buildLedger(options) {
  const root = resolve(options.root);
  const manifest = options.manifest ? readJson(resolve(options.manifest)) : {};
  const defaults = {
    revision: options.revision,
    observedAt: options.observedAt,
    freshness: options.freshness,
  };
  const runs = [...options.runs, ...(manifest.runs || [])].map((run) => ({
    ...defaults,
    ...run,
    path: resolve(run.path),
  }));
  const seen = new Set();
  const provenance = [];
  const rows = [];
  for (const run of runs) {
    if (seen.has(run.path)) throw new Error(`Duplicate report input: ${run.path}`);
    seen.add(run.path);
    const raw = readFileSync(run.path, 'utf8');
    const report = JSON.parse(raw);
    provenance.push({
      path: run.path,
      format: run.format,
      revision: run.revision,
      observedAt: run.observedAt,
      freshness: run.freshness,
      section: run.section,
      layer: run.layer,
      providerMode: run.providerMode,
      providers: run.providers,
      kind: run.kind,
      caveats: run.caveats,
      sha256: digest(raw),
      declaredAssertions: declaredAssertionCount(report),
      reporterErrors: report.numRuntimeErrorTestSuites ?? report.errors?.length ?? 0,
    });
    if (run.format === 'vitest') rows.push(...vitestRows({ report, run, root }));
    else if (run.format === 'playwright') rows.push(...playwrightRows({ report, run }));
    else throw new Error(`Unknown report format: ${run.format}`);
  }
  for (const evidence of manifest.evidence || []) {
    if (!(STATUSES.has(evidence.status) && evidence.artifact && evidence.assertion))
      throw new Error('Manual evidence requires status, artifact and assertion');
    if (!existsSync(resolve(evidence.artifact)))
      throw new Error(`Missing manual evidence artifact: ${evidence.artifact}`);
    provenance.push({
      path: resolve(evidence.artifact),
      format: 'manual',
      revision: evidence.revision || defaults.revision,
      observedAt: evidence.observedAt || defaults.observedAt,
      freshness: evidence.freshness || defaults.freshness,
      sha256: digest(readFileSync(resolve(evidence.artifact))),
      reporterErrors: 0,
    });
    rows.push(
      makeRow({
        run: { ...defaults, ...evidence, path: resolve(evidence.artifact) },
        file: evidence.file || '(manual evidence)',
        name: evidence.name,
        status: evidence.status,
        kind: evidence.kind,
        assertion: evidence.assertion,
        providers: evidence.providers,
      }),
    );
  }
  const inventory = filesUnder(resolve(root, 'src')).filter((file) =>
    /\.test\.[cm]?[jt]sx?$/.test(file),
  );
  const observedFiles = new Set(rows.map((row) => row.file));
  const unobserved = inventory
    .map((file) => relative(root, file).replaceAll('\\', '/'))
    .filter((file) => !observedFiles.has(file));
  return {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Calcutta',
    root,
    provenance,
    rows,
    ...summarize({ rows, providers: providerRegistry(manifest.providers || []) }),
    unobserved,
    routes: routeMatrix({ root, mappings: manifest.routeMappings || [], rows }),
  };
}

function render(ledger) {
  const tally = counts(ledger.rows);
  const parts = [
    '# Test confidence ledger',
    `Generated: ${new Date(ledger.generatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Calcutta', hour12: false })} (Asia/Calcutta).`,
    `${ledger.rows.length} observed entries: ${tally.pass} PASS, ${tally.fail} FAIL, ${tally.notRun} NOT RUN, ${tally.flaky} flaky. These are reporter assertions plus explicitly supplied evidence, not proof of every positive and negative testcase.`,
    'Scores measure evidence strength for the stated assertion, not probability of correctness: 0 = not run; 1 = historical/unspecified provenance; 2 = current simulated fixture; 3 = current isolated runtime or actual browser. Scores 4–5 require independent review of repetition, breadth and target/provider equivalence and are not assigned automatically. A FAIL can have strong evidence. Section scores use the weakest observed executed score; missing cases remain gaps.',
    'Name-based positive/negative/recovery labels are conservative hints. Unclassified cases need assertion review. Provider membership inferred from a file/title is an inventory association, not proof of a provider call. Real-provider evidence requires explicit manifest provenance. Every performance result from this checkout is local.',
    '## Run provenance',
    table({
      headers: [
        'Artifact',
        'Format',
        'Revision',
        'Executed at',
        'Freshness',
        'SHA-256',
        'Reporter errors',
      ],
      rows: ledger.provenance.map((run) => [
        run.path,
        run.format,
        run.revision || 'UNSPECIFIED',
        run.observedAt || 'UNSPECIFIED',
        run.freshness,
        run.sha256,
        run.reporterErrors,
      ]),
    }),
    '## Section confidence',
    table({
      headers: [
        'Section',
        'PASS / FAIL / NOT RUN / flaky',
        'Classification counts',
        'Result',
        'Score / 5',
        'Layer',
        'Remaining gaps',
      ],
      rows: ledger.sections.map((section) => [
        section.section,
        `${section.pass} / ${section.fail} / ${section.notRun} / ${section.flaky}`,
        section.kinds,
        section.status,
        section.score,
        section.layers,
        section.gaps,
      ]),
    }),
    '## Third-party confidence',
    table({
      headers: [
        'Provider',
        'Simulated PASS / FAIL / NOT RUN',
        'Real PASS / FAIL / NOT RUN',
        'Observed result',
        'Score / 5',
        'Remaining gaps',
      ],
      rows: ledger.providers.map((provider) => [
        provider.name,
        `${provider.simulated.pass} / ${provider.simulated.fail} / ${provider.simulated.notRun}`,
        `${provider.real.pass} / ${provider.real.fail} / ${provider.real.notRun}`,
        provider.status,
        provider.score,
        provider.gaps,
      ]),
    }),
    '## Per-test confidence',
    table({
      headers: [
        'ID',
        'Section / provider',
        'Test / intended assertion',
        'Case kind',
        'Result',
        'Score / 5',
        'Layer / provider mode',
        'Attempts / flaky',
        'Revision / freshness / executed at',
        'Evidence / gaps',
      ],
      rows: ledger.rows.map((row) => [
        row.id,
        `${row.section}; ${row.providers.join(', ') || 'none identified'}`,
        `${row.file}: ${row.name}; assertion: ${row.assertion}`,
        `${row.kind}; ${row.classificationBasis}`,
        row.status,
        row.score,
        `${row.layer}; ${row.providerMode}`,
        `${row.attempts} / ${row.flaky}`,
        `${row.revision}; ${row.freshness}; ${row.observedAt}`,
        `${row.artifact}; ${row.caveats.join('; ')}`,
      ]),
    }),
    '## Route positive / negative / recovery gap matrix',
    'Only explicit testcase-to-route mappings count. Public authentication exemptions come from the catalog; other dimensions require applicability review. UNMAPPED does not mean the backend behavior is defective or no test exists.',
    table({
      headers: [
        'Method / route',
        'Authentication contract',
        'Positive',
        'Authentication negative',
        'Tenant negative',
        'Validation negative',
        'Recovery',
      ],
      rows: ledger.routes.map((route) => [
        `${route.method} ${route.path}`,
        route.authentication,
        ...route.dimensions,
      ]),
    }),
    '## Source test files without supplied runtime results',
    `${ledger.unobserved.length} source test files have no supplied result. Dynamic/test.each cases are inventoried from reporters, never guessed from source counts.`,
    table({
      headers: ['File', 'Result / confidence', 'Gap'],
      rows: ledger.unobserved.map((file) => [
        file,
        'NOT RUN / 0',
        'No supplied runtime report for this file',
      ]),
    }),
    '## Assumptions I made',
    'Reporter JSON and explicitly supplied manifests are evidence inputs. Their provenance must be supplied by the caller. This tool does not run providers, infer production equivalence, evaluate assertion logic, or establish complete frontend UX coverage. API/DB/provider suites can run without Browser-MCP; Playwright needs its installed browser. Missing browser runs remain NOT RUN.',
  ];
  return `${parts.join('\n\n')}\n`;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const outputs = [options.output, options.jsonOutput].filter(Boolean).map((path) => resolve(path));
  if (new Set(outputs).size !== outputs.length || outputs.some((path) => existsSync(path)))
    throw new Error('Output must be a new, distinct versioned file');
  const ledger = buildLedger(options);
  for (const path of outputs) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(outputs[0], render(ledger), { flag: 'wx' });
  if (options.jsonOutput)
    writeFileSync(
      outputs[1],
      `${JSON.stringify(ledger, (key, value) => (isSensitiveKey(key) ? '[REDACTED]' : typeof value === 'string' ? mask(value) : value), 2)}\n`,
      { flag: 'wx' },
    );
  process.stdout.write(
    `${ledger.rows.length} evidence rows written; ${ledger.unobserved.length} test files without supplied results.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${mask(error.message)}\n`);
    process.exitCode = 1;
  }
}
