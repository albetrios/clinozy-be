# Kickoff iteration prompt

> The **`be-kickoff-iteration`** skill (`agent-os/skills/be-kickoff-iteration/SKILL.md`) does the
> work — saying "kickoff iteration <name>" or "kickoff <iteration>" triggers it directly; it plans and stops, then the ledger
> rows are built one at a time. This prompt is kept as the explicit paste-in entry point.

**Paste this to Claude Code (here, in clinozy-be) to start a build**, once the iteration's plans
are approved (`Status: approved` in its README). One prompt for every iteration — set `ITERATION`,
or leave it blank and the skill asks which approved iteration to kick off first.

The iteration rule (in full: [iterations/README.md](../../../iterations/README.md)):

- Folders are `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`, opened with `pnpm iteration:new` —
  e.g. `launch-2026-09-30-jxmr`, `feat-pharmacy-returns-2026-10-06-kqzx`. The type is `launch`,
  `feat`, `change` or `fix`.
- The **launch** is the one full snapshot: MODE initial, Baseline `none`.
- Every later iteration is MODE incremental and holds **only its change**; its README names its
  Baseline, the latest iteration on `main` when it was opened.
- Kickoffs follow the Baseline chain: the launch first, then an iteration whose Baseline is `done` or
  `frozen`.
- An iteration is frozen once it merges; a correction is a new `fix` iteration.

---

```text
Kick off iteration <ITERATION> with the be-kickoff-iteration skill — first confirm it is the one to kick off. Plan only — stop before any code.
```

What happens, one stop per step:

0. **Confirm the iteration** — a table of every iteration with whether it is eligible (Status
   `approved`, not yet `implementing`, Baseline `none` or `done`/`frozen`) and why; the
   earliest-opened eligible one is recommended (the launch always first), and you confirm.
1. **Read** the approved `plans/` and the repository's conventions; map every requirement to a
   work item.
2. **Reconcile with the code** — reuse, extend or new, with `file:line` evidence.
3. **Technical questions** — domain placement, foreign keys, delete strategy, permission codes,
   queues; recorded in `plans/decisions.md` as `TECH`.
4. **Write `KICKOFF.md`** — schema first, contracts, build order, work items with their drivers,
   verification, and the ledger.
5. **Self-check**, then stop for your confirmation.

After you confirm `KICKOFF.md`, the iteration's README moves to `Status: implementing` and the ledger is built one row at a time — NEW tables through the
[staged-build prompt](../../getting-started/staged-build-prompt.md), everything else through
`/be-build-requirement` — and no success is reported while any row is open. The agent never pushes,
opens a PR or merges.

## Related

- The whole flow: [process/README.md](../process/README.md)
- The skill: [`be-kickoff-iteration`](../../../agent-os/skills/be-kickoff-iteration/SKILL.md)
- The step before it: [iteration-planning-prompt.md](iteration-planning-prompt.md)
