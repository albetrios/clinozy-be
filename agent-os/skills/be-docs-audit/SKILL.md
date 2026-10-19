---
name: be-docs-audit
description: On-request full pass over docs: index, naming, Mermaid, cross-links. Use when the user asks to review or audit documentation, or after large reorganizations.
indexNote: on-request full docs/ audit (index, naming, Mermaid, cross-links)
---

# Docs audit (clinozy-be)

## Purpose

Run a **full pass** over hand-written docs when the user asks to "review docs", "audit documentation", or similar, or after a large reorganization. This complements **be-docs-maintainer** (which runs on add/rename/move) with a deliberate review.

The audit **reports**; it edits nothing. Fixes go to **be-docs-maintainer** afterwards, from the report. Run it through the **be-docs-auditor** agent: the full pass reads many files, and the agent keeps that out of the main conversation and returns only the report below. This skill is the one copy of the checklist and the report — the agent holds neither.

## When to use

- **Trigger**: User says "review docs", "audit documentation", "check docs", or similar.
- **Trigger**: After a large docs reorganization (e.g. new subfolders, many renames).

## Checklist

1. **Index**  
   Ensure every hand-written doc under `docs/` (in subfolders; no stray root `.md` except `docs/README.md`) is listed in [docs/README.md](../../../docs/README.md) under the correct use-case section, and deployment docs appear in [docs/deployment/README.md](../../../docs/deployment/README.md) where applicable.

2. **Naming**  
   Confirm subfolder + **lowercase kebab-case** filenames (e.g. `getting-started/setup.md`, `reference/testing/load-testing.md`). No UPPER-KEBAB in subfolders. Generated artifacts live in `docs/`: `openapi/` (openapi\*.json), `postman-collection.json`, `routes.txt`. Known subfolders include: `getting-started/`, `process/`, `deployment/`, `integrations/`, `reference/`, `reviews/`, `design-workflow/` (prompts/, process/ — the design-iteration process and paste prompts), `database/` (`clinozy-be.dbml` — auto-generated database diagram). Do not flag these as unexpected.

3. **Mermaid**  
   For each doc that describes a **process, flow, or structure**, confirm it has a Mermaid diagram (flowchart or sequence) GitHub renders. List each one missing.

4. **Cross-links**  
   Spot-check: README.md, CLAUDE.md, `agent-os/skills/**/SKILL.md`, `agent-os/rules/**/*.mdc`, src/tests/load/k6/README.md, .env.example, .github/workflows. List every reference that still points to an old flat path (e.g. `docs/reference/load-testing.md` → `docs/reference/testing/load-testing.md`), with its replacement.

## Output

Classify each checklist finding as **OK**, **Stale** or **Missing**, and return only this report:

```markdown
# Docs audit

## Summary
[1–2 sentences on overall docs health]

## Issues found
- **[file or section]** — [stale link / missing index entry / rename / missing Mermaid]: [what to fix]

## OK
- [checklist item] — [reference]

## Recommended next step
[Which be-docs-maintainer invocations to run, in order]
```

---

**Related skills:** [be-docs-maintainer](../be-docs-maintainer/SKILL.md)
