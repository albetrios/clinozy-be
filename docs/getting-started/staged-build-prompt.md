# Staged build prompt

A copy-paste prompt that builds **one table** end to end in four gated stages — schema design, route
list, full implementation, final recap — and stops for your approval after each one.

## How to use it

1. Take the next open **NEW table** row from the iteration's `KICKOFF.md` ROUTE (see the
   [iteration process](../design-workflow/process/README.md)), in ROUTE order — the
   `be-kickoff-iteration` skill does this for you.
2. Paste that ROUTE row, the requirements it reaches (`iterations/<iteration>/plans/requirements/`)
   and its feature story (`plans/features/<feature>/story.md`), then the prompt below it, as a single
   message.
3. Reply **approved**, **yes** or **go next** to move to the next stage; any other reply revises the
   current stage. Stage 1 is where the table's design is approved — the plan never fixed it. After
   Stage 4, record the row in `AS-BUILT.md` and mark it `done` in the ROUTE.

**Launch tables are all new**, so the prompt works as written for every table in the launch
iteration.

**Changing an existing table** is not this prompt's job — Stage 1's STRICT TABLE RULE forbids
modifying existing tables. The ROUTE sends a CHANGE table (and every flow and background piece) to
`/be-build-requirement` instead.

The prompt is kept verbatim from the core-platform `NEW-PRODUCT-GUIDE.md` (Appendix A, the reusable
template), with one change: Stage 3 ends by running the tests the change selects,
`pnpm test:select --run`, so Stage 4 reports a green run instead of tests nobody ran. The run uses
its own test database, which the test setup creates and migrates; the development database is never
migrated or seeded. A NEW table adds a migration, and a migration selects the whole suite, so this is
`pnpm test` in practice — `pnpm test:select --why` shows why.

## The prompt

````text
Follow a STRICT 4-stage gated workflow. DO NOT skip stages. DO NOT advance to the next stage until I explicitly say: "approved", "yes", or "go next".
If I give feedback, revise ONLY the current stage deliverable and re-submit it for approval. Do not move forward.

GLOBAL WORKING RULES (apply in every stage)
- Scope control:
- Never touch/modify tables, domains or sub-domains unrelated to this feature.
- If a requirement seems to need extra tables/relations or another domain or sub-domain, do NOT create those. Instead: flag it as a decision question and pause for my choice.
- Clarify over guessing:
- Ask a concise question when missing/contradictory details affect integrity/security.
- API contract + messages:
- Follow repo conventions: snake_case body keys, public ids, param naming, headers, method/status policy, error codes.
- User-facing strings must be i18n keys (no raw strings).
- No execution, except the tests:
- DO NOT run migrations against the development database. DO NOT seed it. Only propose output and/or make file edits when in Stage 3.
- At the end of Stage 3, run the tests the change selects: pnpm test:select --run (the test run creates and migrates its own test database).
- Change completeness:
- In Stage 3, update only the "mirror" artifacts required by this feature (route catalog, OpenAPI maps, i18n, permission seed, etc.).

INPUTS I will provide per feature
- Feature name:
- Domain + target resource/table:
- User story fields + semantics:
- Permissions required (if specified):
- Constraints (idempotency, RLS, soft-delete, pagination/filtering):
- Accepted assumptions (if any):

========================
STAGE 1 — Schema Design (GATED)
Goal: Produce the DB schema for the feature.

Deliverable (MUST be in this order):
A) Schema definition (Postgres DDL schema):
- Every field/type, constraints, enums, indexes, RLS multi-tenancy, audit fields.
- Model query patterns implied by the story (filters/search/sort).
B) DB Diagram View (immediately after schema), using this exact Mermaid ERD format:
erDiagram
TABLE_NAME {
TYPE column_name PK
TYPE other_column "nullable"
}
%% Solid line = real FK
%% Dashed line = logical reference only (no FK)
TABLE_NAME ||--o{ OTHER_TABLE : "fk_name"
C) Short rationale (key decisions only).
D) Assumptions / missing info + decision questions.

STRICT TABLE RULE:
- Design exactly ONE table for the feature's main resource.
- Do NOT create additional tables.
- Do NOT modify any existing tables/domains.
Stop after Stage 1. Wait for my explicit approval/comment.

========================
STAGE 2 — Route List (GATED)

Goal:
Design the complete API route contract for the approved feature.

Deliverable:
Return ONLY ONE table in the following format.

| Method | Route | Purpose | Permission | Path Params | Query Params | Request Body | Success Status | Idempotent |
|--------|-------|---------|------------|-------------|--------------|--------------|----------------|------------|

Requirements:
- Include all CRUD routes.
- Include all implied routes (pagination, filtering, searching, sorting, status transitions, restore/archive, bulk operations, idempotent endpoints) only if applicable to the feature.
- Keep every route strictly within the approved feature scope.
- Reuse existing authentication and permission conventions.
- Do not invent routes for other sub-domains or resources.

STRICT RULES:
- Output ONLY the table.
- Do NOT explain the routes.
- Do NOT include request/response examples.
- Do NOT include JSON.
- Do NOT include business logic.
- Do NOT include implementation details.
- Do NOT include assumptions or notes.

If any route requires another domain, sub-domain or table, stop and ask for clarification instead of creating the route.

Stop after Stage 2 and wait for my approval before proceeding to Stage 3.
========================
STAGE 3 — Full Implementation (GATED)
Goal: Build the full vertical slice for approved schema + routes.

Deliverable:
- route definitions
- controllers
- services (business logic)(Ensure that the connection is solely service-to-service and does not involve any calls to other repositories.)
- repository layer (DB access)
- DTOs / validation schemas
- serializers
- error handling for each failure case implied by the story
- E2E tests for every route: happy path, validation failures, auth failures, edge cases, state-transition edge cases
- seed data covering realistic records for every entity/state needed for QA + tests
- run the tests the change selects: pnpm test:select --run
- summarize test coverage per route, with the result of that run

HARD CONSTRAINTS:
- Implement only within feature scope + required mirrors.
- Do not run migrations against the development database or seed it.
- Every selected test passes before you stop: fix a failure inside the feature scope and re-run; a failure outside it is a decision question — stop and ask.
Stop after Stage 3. Wait for approval/comment.

========================
STAGE 4 — Final Recap Package (GATED)
Goal: One consolidated review artifact.

Deliverable (single consolidated summary):
A) Final schema (DDL), immediately followed by the DB Diagram View (same Mermaid ERD format as Stage 1).
B) Final route list (exact method/path + permission + idempotency notes).
make perfect table with method , routes , permission and params
C) Please provide the changed-files tree showing ONLY what changed (not the full project tree).

Output it inside a single code block (```), in this EXACT format:
|-app
|--sub-domain
|---....

Rules:
- Wrap the entire tree inside a code block (```)
- List full relative file paths from project root
- Use "Created:" for new files only
- Use "Modified:" for existing files that were edited
- If a section is empty, write "(none)" under it
- Do NOT include deleted files, folders, or unchanged files
- Do NOT include explanations, comments, or extra text outside the code block
- Do NOT show the full project directory tree

D) Test run: the command (pnpm test:select --run), how many test files it selected and why (pnpm test:select --why), and the result — every selected file passing.

After Stage 4:
- Do not change anything until I comment.
- If I comment, first list exactly which files/layers you'll change per comment, then apply.

Now start with STAGE 1 using the feature story I provided.
````
