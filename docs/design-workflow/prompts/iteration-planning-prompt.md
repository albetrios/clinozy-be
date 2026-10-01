# Iteration planning prompt

> The **`be-iteration-planning`** skill (`agent-os/skills/be-iteration-planning/SKILL.md`) does
> the work — saying "plan iteration <name>" triggers it directly. This prompt is the explicit
> paste-in entry point.

**Paste this to Claude Code (here, in clinozy-be)** once the iteration's drop is in
`intake-files/` (`pnpm iteration:intake`). Set `ITERATION` and, if you want, the scope — the mode
comes from the iteration's README (Baseline `none` = initial, otherwise incremental).

## When to use

At the start of every iteration, before any code. The skill confirms the iteration and its Baseline
with you, checks the intake, takes the delta from `pnpm iteration:diff` when the iteration is
incremental, reconciles the PRD with `schema-routes.md`, asks the blocking questions only you can
answer, and writes `KICKOFF.md` — the plan with its ordered ROUTE ledger — plus `plans/`
(decisions, coverage, requirements with Mermaid data diagrams, feature stories, acceptance). It
stops after every step, writes no code and no technical design, and ends at
`Status: ready-for-approval`. Your go-ahead sets `Status: approved`; then use the
[kickoff iteration prompt](kickoff-iteration-prompt.md).

## The prompt

```text
Plan iteration <ITERATION> with the be-iteration-planning skill. Scope: <everything in the drop | the named features>. Requirements only — no code. Stop after every step.
```

`<ITERATION>` is the folder name, e.g. `launch-2026-09-30-jxmr` or
`feat-pharmacy-returns-2026-10-06-kqzx` (`pnpm iteration:list` shows them all).

## Related

- The whole flow: [process/README.md](../process/README.md) · every step: [iteration-guide.md](../process/iteration-guide.md)
- The skill: [`be-iteration-planning`](../../../agent-os/skills/be-iteration-planning/SKILL.md)
- The iteration rules: [iterations/README.md](../../../iterations/README.md)
