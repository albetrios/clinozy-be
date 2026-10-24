---
description: Take main to production — readiness plan, Release PR, the approved production deploy, live check
argument-hint: "[review | release] — no argument runs both; review stops after the plan; release skips it"
allowed-tools: Bash(git*), Bash(gh*), Bash(pnpm*)
---

Follow the **be-path-to-production** skill (`agent-os/skills/be-path-to-production/SKILL.md`) from a
green `main` to a live production backend:

1. **Readiness review and plan** — the skill's step 1 (`/be-prod-readiness` runs its review
   pipeline). Present the plan and wait for the user's go. `review` stops here.
2. **Release PR** — `gh workflow run post-merge-ci.yml -f release_pr=true -f skip_docker=true -f skip_docs=true`,
   then wait for `chore(main): release X.Y.Z`.
3. **Merge it** when `Quality gate` and `Checks` are green (squash, title kept).
4. **Production deploy** — tell the user when **Release deploy (production)** waits for their
   approval, with the run link. Never approve it yourself.
5. **Live** — watch the run to **Environment fully live**. On a failure, read the step's log and
   follow the skill's "When a deploy fails".

`release` (**$ARGUMENTS**) skips step 1 only when the user has said so. When clinozy-fe has a release
that depends on this one, it goes next, with **`/fe-release`** in that repository.
