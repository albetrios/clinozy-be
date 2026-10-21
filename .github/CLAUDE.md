# CI, branches and merging — clinozy-be

Claude Code loads this file when it works in `.github/`. It holds sections moved out of the root [`CLAUDE.md`](../CLAUDE.md), which keeps a pointer to each; the root rules apply here too.

## Git branch naming

Working branches are `<type>/<short-description>`; `main` is the only long-lived branch. Enforced by [`.husky/pre-push`](../.husky/pre-push) (rule: `agent-os/rules/be-git-branch-naming.mdc`, owner: **be-code-quality-guard**).

**AI web sessions start on a throwaway name.** Claude Code web assigns `claude/<platform-slug>` (e.g. `claude/session-request-wx3euu`) before the container boots. The slug is generated platform-side and is **not configurable from this repo** — no file here changes it. Rename it to a meaningful name rather than shipping it.

**Name the branch before the first push.** The cloud git proxy accepts a push to *any* branch name but **rejects every form of delete** (`git push --delete`, `git push :ref`, and `DELETE /git/refs/...` → 403). A `claude/*` branch that has already been pushed therefore cannot be cleaned up from inside the session. Renaming first means the throwaway name never reaches the remote:

```sh
git branch -m docs/american-spelling-organization      # rename in place, BEFORE any push
git push -u origin docs/american-spelling-organization
```

Already pushed as `claude/*`? Leave it — it auto-deletes when the PR squash-merges. Never open a second PR just to fix a branch name.

**Deriving the name** — `<type>` is the change's conventional-commit type (`feat`, `fix`, `hotfix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`, matching `BRANCH_TYPES` in `.husky/pre-push`); `<short-description>` is kebab-case, 2–5 words, ≤ 40 chars, naming the change itself (never a ticket id or a date). Keep it aligned with the commit subject and PR title.

| Change | Branch |
| ------ | ------ |
| Fix British spelling in a doc | `docs/american-spelling-organization` |
| Add `POST /billing/invoices` | `feat/billing-invoice-route` |
| RLS scope bug on `webhook_event` | `fix/webhook-event-rls-scope` |
| Bump Fastify to 5.3 | `chore/bump-fastify-5-3` |

## Merge policy

- **Merge policy — never merge on red (enforced, not convention):** the `main` ruleset has **no `bypass_actors`**, so a PR with any failing or pending required check (`Quality gate`, `Checks`) **cannot be merged by anyone — the repo owner included**. Never re-add `bypass_actors` to `.github/rulesets/main.json`, and never merge with `--admin` / the merge API to skip a red gate: a flaky-red required check is **re-run (or its branch updated) to green**, never bypassed. `strict up-to-date` is off so a green PR merges cleanly via `gh pr merge --squash` — safe because every PR CI lane, the DB matrix included, tests the PR merged with `main` (`github.sha`), never the branch head (pinned by [`pr-merge-commit.policy.unit.test.ts`](../src/tests/unit/ci/pr-merge-commit.policy.unit.test.ts)); `required_signatures` is intentionally absent (unsigned branch commits — GitHub signs the squash-merge commit on `main` regardless). Pinned by [`src/tests/unit/ci/rulesets.policy.unit.test.ts`](../src/tests/unit/ci/rulesets.policy.unit.test.ts).
