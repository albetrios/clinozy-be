# Kickoff iteration prompt

> The **`be-kickoff-iteration`** skill (`agent-os/skills/be-kickoff-iteration/SKILL.md`) does the
> work — saying "kickoff", "kickoff iteration <name>" or "start implementing <iteration>" triggers
> it directly. This prompt is kept as the explicit paste-in entry point.

**Paste this to Claude Code (here, in clinozy-be) to start implementing**, once the iteration's
`KICKOFF.md` is approved (`Status: approved` in its README). Set `ITERATION` and, if you want, the
scope — or leave `ITERATION` blank and the skill asks which approved iteration to kick off first.
The mode comes from the README (Baseline `none` = initial, otherwise incremental).

The iteration rule (in full: [iterations/README.md](../../../iterations/README.md)):

- Folders are `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`, opened with `pnpm iteration:new` —
  e.g. `launch-2026-09-30-jxmr`, `feat-pharmacy-returns-2026-10-06-kqzx`.
- Every iteration's `intake-files/` stores what arrived (Intake mode `full`, `overlay` or
  `brief` — an overlay or a brief resolves the rest of its snapshot from its Baseline); the kickoff
  runs the gate, `pnpm iteration:intake <iteration> --check`, first and stops when it fails.
- `AS-BUILT.md` ends with the Standing deviations — the Baseline's list, minus what this iteration
  resolves, plus its new ones.
- `KICKOFF.md` is the approved plan and ROUTE ledger — frozen at approval. What was actually built
  goes into `AS-BUILT.md`, row by row.
- Kickoffs follow the Baseline chain: an iteration is eligible once its Baseline is `none`, `done`
  or `frozen`.

---

```text
Kick off iteration <ITERATION> with the be-kickoff-iteration skill. Scope: <the whole ROUTE | rows #a–#b>. Follow the ROUTE one row at a time and stop for my review after each row.
```

What happens:

0. **Confirm the iteration** — a table of every iteration and whether it is eligible (Status
   `approved`, not yet `implementing`, Baseline `none` or `done`/`frozen`) and why; the
   earliest-opened eligible one is recommended (the launch always first); you confirm; the README
   moves to `Status: implementing`.
1. **Each ROUTE row** — built through its driver (a NEW table through the
   [staged-build prompt](../../getting-started/staged-build-prompt.md), everything else through
   `/be-build-requirement`), verified, recorded in `AS-BUILT.md`, its impact on upcoming rows
   checked — a scope change stops and asks — then a stop for your review.
2. **Close** — the repository's gates, `/be-pre-merge-review` as a review only, every row `done` or
   `deferred` with your OK, `plans/acceptance.md` filled, the `AS-BUILT.md` summary, then
   `Status: done`.

No success is reported while any row is open, and the agent never pushes, opens a PR or merges.

## Related

- The whole flow: [process/README.md](../process/README.md) · every step: [iteration-guide.md](../process/iteration-guide.md)
- The skill: [`be-kickoff-iteration`](../../../agent-os/skills/be-kickoff-iteration/SKILL.md)
- The step before it: [iteration-planning-prompt.md](iteration-planning-prompt.md)
