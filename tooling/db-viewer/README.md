# DB Viewer (local tooling)

Zero-dependency live ER diagram for Drizzle `*.schema.ts` files and hand-written `migrations/*.sql` — plus **plan mode**, which draws each open design iteration's planned data model next to the live schema.

Owned by this repo under `tooling/db-viewer` — same pattern as `tooling/dev/dashboards` and `tooling/setup` (module folder + co-located config, thin root script).

## Run

From the clinozy-be root:

```bash
pnpm db:viewer
```

Opens http://127.0.0.1:4984 by default (loopback only — near Drizzle Studio on `:4983`).
The printed/opened URL carries a per-boot random session token that `/api/*` and `/events`
require (loopback is shared by every local process) — always use the URL the CLI gives you.

Optional overrides:

```bash
DB_VIEWER_PORT=4990 pnpm db:viewer
pnpm db:viewer -- --no-open
pnpm db:viewer -- --port 4990
```

### Plan mode — iteration plans after Latest

Every design iteration under `iterations/` that has a `plans/db-changes.md` and is not `frozen` shows
as a dashed **◇ plan** entry above **Latest** in the versions rail. `plans/db-changes.md` is the one
file per iteration that holds its Mermaid `erDiagram` blocks, written on the go while planning
(`agent-os/skills/be-iteration-planning` › Data diagrams).

Clicking a plan shows **Latest + that plan**, diffed against Latest:

| Plan marker | On the canvas |
| --- | --- |
| `NEW` | a dashed table (logical types, italic) under the label's `domain.table` — or, until the user has chosen one, under `app` with the repository's plural snake_case name (`branch` → `branches`). When a live table of that name already exists (built at kickoff), that table is marked `new` instead — never drawn twice |
| `CHANGED` | the live table with the plan's `ADDED` fields added, `REMOVED` fields removed, and `CHANGED: …` fields shown as modified ("planned: …") |
| `EXISTING` | the live table, marked `existing`; nothing changes |
| `REMOVED` | the live table, shown as removed |

Entities match live tables by the label's `domain.table` when it has one, else by name, singular
or plural (`organization` → `organizations`).
Relationships keep the plan's own cardinality and are drawn dashed. The change feed starts with a
plan banner (counts, the file, and notes such as an entity that matched no table). Plans never
enter replay or the saved history, and SQL export and deep review are off for them — their types
are logical until each table is designed at kickoff. Editing `db-changes.md` (or an iteration's
README) redraws the plan live.

```bash
pnpm db:viewer -- --iterations ./iterations   # default: config "iterations", else ./iterations
```

### Deep review (optional)

`POST /api/review` spawns the local `claude` CLI. It is **off by default**.

```bash
DB_VIEWER_REVIEW=1 pnpm db:viewer
```

When enabled it still requires loopback bind, a local `Host`, a local `Origin` (if present), the per-boot session token, `Content-Type: application/json`, and at most one in-flight child. The child gets an allow-listed env (not your full `.env`) and a neutral cwd (`os.tmpdir()`), so schema text in the prompt cannot steer it into reading repo files.

## Config

`tooling/db-viewer/config.json` (co-located; not a root config file):

```json
{
  "name": "clinozy-be",
  "schema": "./src",
  "migrations": "./migrations",
  "iterations": "./iterations",
  "port": 4984
}
```

Paths are relative to the repo root. Port can also come from `DB_VIEWER_PORT` (local process env only — not in env-schema). A malformed config fails loud instead of silently falling back.

Runtime history (save mode) lands in `tooling/db-viewer/.db-viewer-history/` (gitignored in-module).

## Layout

```text
tooling/db-viewer/
  cli.mjs           # entry (pnpm db:viewer)
  server.mjs        # HTTP + watch + APIs (127.0.0.1)
  config.json       # co-located defaults
  lib/              # parser, SQL migrations, project resolve, diff, normalize, plan (plan mode)
  public/           # static UI
  README.md
```
