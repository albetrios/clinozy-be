---
description: Run the local validate gate (Biome lint + format + typecheck) and fix issues you introduced
argument-hint: "[--affected] — show what git push will run and which tests the selection picks, and why"
allowed-tools: Bash(pnpm validate*), Bash(pnpm lint*), Bash(pnpm typecheck*), Bash(pnpm format*), Bash(pnpm test:affected*)
---

With `--affected`: run `pnpm test:affected` (the base is the upstream, else `origin/main`; pass
`--base <ref>` for another) and show its two tables as they are — the steps `.husky/pre-push` will
run for the pushed commits, each with why it runs or not, and the tests `pnpm test:select` picks,
each with why. Change nothing, then stop.

Without an argument:

Run `pnpm validate` (Biome lint + format check + TypeScript typecheck).

If it passes, report green and stop.

If it fails:

1. Show the failing output.
2. Fix only the issues introduced by the current working-tree changes — do not
   mass-reformat or "fix" unrelated files.
3. Re-run `pnpm validate` until green.

Report the final status and what you changed.
