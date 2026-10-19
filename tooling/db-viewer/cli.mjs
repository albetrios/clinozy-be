#!/usr/bin/env node
// DB Viewer CLI for this project.
//
//   pnpm db:viewer
//   node tooling/db-viewer/cli.mjs --no-open
//   DB_VIEWER_PORT=4990 pnpm db:viewer
//   DB_VIEWER_REVIEW=1 pnpm db:viewer   # opt-in Claude review endpoint

import { resolveProject, DEFAULT_PORT } from './lib/project.mjs';
import { startServer } from './server.mjs';
import { parseCommandLine } from '../setup/common/script.ts';

function usage() {
  console.log(`
  DB Viewer — local Drizzle ER canvas (repo tooling)

  Usage:
    pnpm db:viewer
    node tooling/db-viewer/cli.mjs [options]

  Options:
    -p, --port <n>         Port (default ${DEFAULT_PORT}, or DB_VIEWER_PORT / config.json)
    --schema <path>        Schema file or folder (relative to project root)
    --migrations <path>    Migrations folder with .sql files
    --iterations <path>    Design iterations folder — each plans/db-changes.md is drawn after Latest (plan mode)
    --no-open              Do not open the browser
    --open                 Open the browser (default)
    --fresh                Ignore saved version history (save mode)
    -h, --help             Show help

  Env:
    DB_VIEWER_PORT=4990    Override port
    DB_VIEWER_REVIEW=1     Enable POST /api/review (loopback + Origin checks; spawns claude)
`);
}

/**
 * Reads the command line. A bad argument (unknown, a value option without its value, a port that
 * is not a positive number) prints its message and the usage and stops startup.
 */
function parseViewerArguments(argv) {
  const out = {
    port: null,
    schema: null,
    migrations: null,
    iterations: null,
    open: true,
    fresh: false,
    help: false,
    bad: false,
  };
  let values;
  try {
    ({ values } = parseCommandLine({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
        'no-open': { type: 'boolean' },
        open: { type: 'boolean' },
        fresh: { type: 'boolean' },
        port: { type: 'string', short: 'p' },
        schema: { type: 'string' },
        migrations: { type: 'string' },
        iterations: { type: 'string' },
      },
      messages: {
        unknownOption: (option) => `Unknown argument: ${option}`,
        needsValue: (option) => `Missing value for ${option}`,
      },
    }));
  } catch (error) {
    console.error(error.message);
    return { ...out, help: true, bad: true };
  }
  out.help = values.help === true;
  out.open = values['no-open'] !== true;
  out.fresh = values.fresh === true;
  out.schema = values.schema ?? null;
  out.migrations = values.migrations ?? null;
  out.iterations = values.iterations ?? null;
  if (values.port !== undefined) {
    const port = Number(values.port);
    if (Number.isFinite(port) && port > 0) {
      out.port = port;
    } else {
      console.error(`Invalid port: ${values.port}`);
      out.help = true;
      out.bad = true;
    }
  }
  return out;
}

function main() {
  const args = parseViewerArguments(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(args.bad ? 1 : 0);
  }

  const project = resolveProject({
    cwd: process.cwd(),
    schema: args.schema || undefined,
    migrations: args.migrations || undefined,
    iterations: args.iterations || undefined,
    port: args.port || undefined,
  });

  if (project.configError) {
    console.error(`\n  DB Viewer: ${project.configError}\n`);
    process.exit(1);
  }

  if (!project.schemaTarget) {
    console.error(`
  DB Viewer: could not find a Drizzle schema under ${project.root}

  Check tooling/db-viewer/config.json, or pass --schema / --migrations.
`);
    process.exit(1);
  }

  startServer({
    schemaTarget: project.schemaTarget,
    migrationsDir: project.migrationsDir,
    iterationsDir: project.iterationsDir,
    port: args.port || project.port,
    fresh: args.fresh,
    open: args.open,
    projectName: project.name,
    projectRoot: project.root,
  });
}

main();
