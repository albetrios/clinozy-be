# Staged build prompt

A copy-paste prompt that builds **one table** end to end in four gated stages — schema design, route
list, full implementation, final recap — and stops for your approval after each one.

## How to use it

1. Open the iteration's plans in `iterations/<iteration>/plans/` (see
   [iterations/README.md](../../iterations/README.md)). There is one `<table>.md` per table; build
   them in the order `plans/product-plan.md` gives.
2. Paste that one table file, then the prompt below it, as a single message.
3. Reply **approved**, **yes** or **go next** to move to the next stage; any other reply revises the
   current stage.

**Launch tables are all new**, so the prompt works as written for every table in the launch
iteration.

**Changing an existing table** in a later iteration needs a "change" variant of this prompt, which
is not written yet — Stage 1's STRICT TABLE RULE forbids modifying existing tables. Until it exists,
use this prompt only for tables that are new in the iteration.

The prompt is kept verbatim from the core-platform `NEW-PRODUCT-GUIDE.md` (Appendix A, the reusable
template).

## The prompt

````text
Follow a STRICT 4-stage gated workflow. DO NOT skip stages. DO NOT advance to the next stage until I explicitly say: "approved", "yes", or "go next".
If I give feedback, revise ONLY the current stage deliverable and re-submit it for approval. Do not move forward.

GLOBAL WORKING RULES (apply in every stage)
- Scope control:
- Never touch/modify tables or domain modules unrelated to this feature.
- If a requirement seems to need extra tables/relations or another domain module, do NOT create those. Instead: flag it as a decision question and pause for my choice.
- Clarify over guessing:
- Ask a concise question when missing/contradictory details affect integrity/security.
- API contract + messages:
- Follow repo conventions: snake_case body keys, public ids, param naming, headers, method/status policy, error codes.
- User-facing strings must be i18n keys (no raw strings).
- No execution:
- DO NOT run migrations. DO NOT seed. DO NOT run tests. Only propose output and/or make file edits when in Stage 3.
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
- Do not invent routes for other modules or resources.

STRICT RULES:
- Output ONLY the table.
- Do NOT explain the routes.
- Do NOT include request/response examples.
- Do NOT include JSON.
- Do NOT include business logic.
- Do NOT include implementation details.
- Do NOT include assumptions or notes.

If any route requires another domain, table, or module, stop and ask for clarification instead of creating the route.

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
- summarize test coverage per route

HARD CONSTRAINTS:
- Implement only within feature scope + required mirrors.
- Do not run migrations/seed/tests.
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

After Stage 4:
- Do not change anything until I comment.
- If I comment, first list exactly which files/layers you'll change per comment, then apply.

Now start with STAGE 1 using the feature story I provided.
````
