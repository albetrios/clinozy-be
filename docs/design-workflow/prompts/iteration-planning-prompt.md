# Iteration planning prompt

> The **`be-iteration-planning`** skill (`agent-os/skills/be-iteration-planning/SKILL.md`) does
> the work — saying "plan iteration <name>" triggers it directly. This prompt is the explicit
> paste-in entry point.

**Paste this to Claude Code (here, in clinozy-be)** once the iteration folder holds its `PRD.md`
and `schema-routes.md` — the folder opened with `pnpm iteration:new`, `schema-routes.md` copied
byte-for-byte from the same-named clinozy-fe folder. Set `ITERATION`, nothing else.

## When to use

At the start of every iteration — the launch and every `feat`, `change` or `fix` after it — before
anyone decides how to build it. The skill turns the PRD and `schema-routes.md` into requirements
under `iterations/<iteration>/plans/`: a coverage matrix, a reconciliation of the two sources, the
blocking questions only you can answer, requirements by angle with Mermaid data diagrams, and one
story per feature. It first confirms which iteration to plan (Step 0 — eligible = Status
`planning`), stops after every step, writes no code and no technical design, and ends with
the iteration's README at `Status: ready-for-approval`. Your go-ahead sets `Status: approved`; then
use the [kickoff iteration prompt](kickoff-iteration-prompt.md).

## The prompt

```text
Plan iteration <ITERATION> with the be-iteration-planning skill. Requirements only — no code. Stop after every step.
```

`<ITERATION>` is the folder name, e.g. `launch-2026-09-30-jxmr` or
`feat-pharmacy-returns-2026-10-06-kqzx` (`pnpm iteration:list` shows them all).

## Related

- The whole flow: [process/README.md](../process/README.md)
- The skill: [`be-iteration-planning`](../../../agent-os/skills/be-iteration-planning/SKILL.md)
- The iteration rules: [iterations/README.md](../../../iterations/README.md)
