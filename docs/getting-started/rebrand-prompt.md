# Rebrand prompt — derive a new product from this repo

A copy-paste prompt for an AI agent (Claude Code, Cursor, Codex) that renames this backend to a new
product **end to end**: rename, verify, independently sweep for misses, test, and start a fresh
history. [adopting-as-template.md](adopting-as-template.md) explains *what* `pnpm init:project`
covers; this file is *how an agent runs it* without repeating the mistakes the first real rename made.

**How to use it:** fill in the inputs below, paste everything from [The prompt](#the-prompt) down
into a new agent session opened in this repo, and let it run. It stops and asks at every
irreversible or outward-facing step.

---

## Inputs

| Input          | Example            | Notes                                                                                                     |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `NEW_SLUG`     | `acme-be`          | Lowercase, hyphens. Becomes containers, roles (`acme_be_app`), JWT issuer, database name (`acme`)        |
| `DISPLAY_NAME` | `Acme Backend`     | Project name for OpenAPI, MCP, CI reports. **Never ends in `API`** — the generator appends it            |
| `BRAND_NAME`   | `Acme`             | What end users see: email sender, passkey prompt, authenticator label. Omit to reuse `DISPLAY_NAME`      |
| `NEW_REPO`     | `acme-org/acme-be` | GitHub `owner/name`. It may already exist and hold a **different** product — Phase 0 checks              |
| `HISTORY`      | `fresh` or `keep`  | `fresh` = one root commit, no inherited history (what the first rename chose)                            |
| `PUBLISH`      | `no` or `yes`      | `no` = stay local with no remote (what the first rename chose). `yes` only after Phase 0 is answered     |

---

## The prompt

> Rebrand this repo to slug **`<NEW_SLUG>`**, display name **`<DISPLAY_NAME>`**, brand
> **`<BRAND_NAME>`**, repository **`<NEW_REPO>`**, history **`<HISTORY>`**, publish **`<PUBLISH>`**.
> Follow every phase below in order. Verify each step with real command output — never report a
> step done on inspection alone, and read a command's real exit status, not a wrapper's. Ask me
> before anything irreversible or outward-facing (deleting `.git`, stopping containers, any push,
> any GitHub call that writes). Do not read or print `.env.local` or any `.env.<environment>` file.
> If you find a rename miss that is not listed as already guarded, fix it **in the rebrand
> tooling** with a regression test, not only in the renamed files.

### Phase 0 — Confirm before touching anything

1. Read `tooling/setup/setup.config.json` → `project.*` and `providers.github.repository`. Record the
   **current** `name`, `displayName`, `brandName`, `previousNames`, `previousOwners` and owner. Call
   them `OLD_*` from here on.
2. `git status` must be clean. Record `OLD_HEAD=$(git rev-parse HEAD)` and the `origin` URL.
3. **Snapshot the pre-rebrand tree** into the scratchpad. Phase 5 diffs against it, and it survives
   even after `.git` is replaced:

   ```bash
   mkdir -p "$SCRATCH/orig" && git archive HEAD | tar -x -C "$SCRATCH/orig"
   ```

4. **Check what `NEW_REPO` already holds — read-only.** The first rename found the target name
   already taken by the product's older, live codebase in another language (dozens of branches,
   hundreds of commits) and force-pushed over its `main` before noticing:

   ```bash
   git ls-remote --heads https://github.com/<NEW_REPO>.git | wc -l
   gh api repos/<NEW_REPO> --jq '{created_at, pushed_at, language, description}'
   ```

   Count commits by fetching, never with `gh api …/commits` (one page of 30). If the repo exists
   and holds anything, **stop and ask**: a new repo name, a new branch, or replacing `main` after
   pinning the old tip as `legacy/main`.

### Phase 1 — Rename

```bash
pnpm install
pnpm init:project --dry-run --name <NEW_SLUG> --display-name "<DISPLAY_NAME>" --brand-name "<BRAND_NAME>" --repository <NEW_REPO>
pnpm init:project --yes     --name <NEW_SLUG> --display-name "<DISPLAY_NAME>" --brand-name "<BRAND_NAME>" --repository <NEW_REPO>
```

The script has no `--help`; an unknown flag drops into its interactive prompts. It appends the old
slug, frontend slug and owner to `previousNames` / `previousOwners`, so the identity gate keeps
failing on any leftover. If generation fails it restores the manifest — fix the reported problem and
re-run the same command.

### Phase 2 — Identity gate

```bash
pnpm tool:generate-project-identity:check
```

It fails on: drift in generated artifacts; the current slug, owner, display name or brand hardcoded
in code or config (the brand as a whole word); and any **previous** slug, database name or owner
left anywhere outside `CHANGELOG.md`, `docs/reviews/` and `docs/superpowers/`. Rename each hit. If
a hit is your own example text, use a generic placeholder (`acme-be`), never a real old name.

### Phase 3 — Local stack

The rename changes the Compose container names **and** the Postgres volume, so:

- Containers of the old identity still hold ports 5432 and 6379. Ask, then stop them
  (`docker stop <old-slug>-postgres <old-slug>-redis`); their volumes survive.
- The new stack starts on an **empty** volume: `pnpm db:migrate`, `pnpm db:seed`.
- `.env.local` still names the old database roles. `pnpm setup:local --force-env-local` rewrites the
  **whole** file from `.env.example` — the user must copy any provider keys out first; agents are
  blocked from reading it.
- Run `pnpm setup:local` from an interactive terminal. Without one it can wait on a prompt forever
  with an empty log — the first rename lost nine hours to this.
- A `.env.local` scaffolded before the worker-pool fix still has `DATABASE_POOL_MAX=20` and
  `POSTGRES_MAX_CONNECTIONS=100`; the worker's boot guard then refuses to start. The template now
  ships `DATABASE_POOL_MAX=60` with `POSTGRES_MAX_CONNECTIONS` unset.

Health endpoints: `GET /livez` and `GET /readyz` on the API (`:3000`), `GET /readyz` on the worker
(`:9090`). There is no `/health`.

### Phase 4 — Gates

```bash
pnpm format
pnpm health
```

`pnpm health` runs 28 phases, including **Project identity**, and continues through failures.
After a rename expect to regenerate `pnpm routes:catalog`, `pnpm docs:all` and
`pnpm tool:project-structure-tree`. Every phase must pass.

### Phase 5 — Independent sweep (do not trust the gates alone)

**Use `git grep -P`.** `git grep -E` does not support `\b`: the pattern silently matches nothing and
reports a false "clean". The first rename's audit said "0 leftovers" twice because of this.

**5a. Old names still present**, for each `OLD_*` slug, the bare brand word and the old owner:

```bash
git grep -niIP "<old>" -- . ':!CHANGELOG.md' ':!docs/reviews' ':!docs/superpowers' ':!tooling/setup/setup.config.json'
```

A miss is the old name used as the *product*: copy, a sender name, an OpenAPI description, a Redis
prefix, a database role in a test, an uppercase banner.

**5b. Nothing legitimate was renamed.** `core` is also an ordinary word and an architectural layer
here. Every count must be ≥ the original:

```bash
ORIG="$SCRATCH/orig"
for t in 'src/core' '@/core/' 'Corepack' 'Core pattern' 'Core layout' 'Core engineering'; do
  o=$(grep -rIoh --exclude=CHANGELOG.md --exclude=rebrand-prompt.md "$t" "$ORIG" | wc -l | tr -d ' ')
  n=$(git grep -Ioh "$t" -- ':!CHANGELOG.md' ':!**/rebrand-prompt.md' | wc -l | tr -d ' ')
  [ "$o" -gt "$n" ] && v="*** LOST $((o-n)) ***" || v=ok
  printf '%-18s %6s %6s  %s\n' "$t" "$o" "$n" "$v"
done
```

**5c. Connection strings, both directions.** A placeholder (`user:password@host:5432/db`) must stay
a placeholder, a restricted-role URL must keep its role and secret, and every CI service container
must name the same database as the URL beside it:

```bash
git grep -nIP "POSTGRES_(USER|PASSWORD|DB):\s*<old-stem>(?![A-Za-z0-9])|-[Ud] <old-stem>(?![A-Za-z0-9])|@[^/ ]+/<old-stem>(?![A-Za-z0-9])" -- .
git grep -nI "postgresql://" -- src tooling .github | grep -v '<new-stem>:<new-stem>@'
```

The second command's output should be only placeholders and role URLs — never a placeholder turned
into `<new-stem>:<new-stem>@…`.

**5d. User-facing placeholders.** `EMAIL_FROM_NAME` and `WEBAUTHN_RP_NAME` in `.env.example` are
generated from the brand; `API_DOCS_BASE_URL` (`docs.yourdomain.com`) is a placeholder until a docs
site exists — report it, don't invent a domain.

**5e. Every substitution, word by word.** Align each changed line with the snapshot and print what
now sits where the new stem appears. Read the whole list:

```bash
NEW_STEM=<new-stem> ORIG="$SCRATCH/orig" python3 - <<'PY'
import collections, difflib, os, re, subprocess
orig, stem = os.environ['ORIG'], os.environ['NEW_STEM']
files = subprocess.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
                       capture_output=True, text=True).stdout.split()
pairs = collections.Counter()
for f in files:
    if f.startswith(('CHANGELOG.md', 'pnpm-lock.yaml')) or not os.path.exists(os.path.join(orig, f)):
        continue
    try:
        a = open(os.path.join(orig, f), encoding='utf-8').read().splitlines()
        b = open(f, encoding='utf-8').read().splitlines()
    except (UnicodeDecodeError, IsADirectoryError):
        continue
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != 'replace':
            continue
        for old_line, new_line in zip(a[i1:i2], b[j1:j2]):
            if not re.search(stem, new_line, re.I):
                continue
            ow = re.findall(r'[A-Za-z0-9_.\-/:@]+', old_line)
            nw = re.findall(r'[A-Za-z0-9_.\-/:@]+', new_line)
            for t, x1, x2, y1, y2 in difflib.SequenceMatcher(None, ow, nw, autojunk=False).get_opcodes():
                if t == 'replace':
                    for o, n in zip(ow[x1:x2], nw[y1:y2]):
                        if re.search(stem, n, re.I):
                            pairs[(o, n)] += 1
for (o, n), c in pairs.most_common():
    print(f'{c:5}  {o!r:50} -> {n!r}')
PY
```

For each pair ask: was the left side the **product**? Red flags: a placeholder credential on the
left, a restricted role collapsed into the superuser, an ordinary word, a casing change.

### Phase 6 — Full test pass

Stop the API and worker first — the tests share their database and Redis, and a running worker
drains rows the tests assert on.

```bash
pnpm ci:local        # validation, build, every test lane, route coverage
pnpm ci:quality      # property, contract, dependency audit, locale keys, identity
pnpm knip
pnpm test:rls-role   # e2e + integration as the restricted role; 6 skips are by design
```

Then restart `pnpm dev` and `pnpm dev:worker`, re-seed (the tests reset the data), and run the live
smoke test:

```bash
pnpm db:seed && pnpm db:seed:full && pnpm db:seed:demo-admin
pnpm test:api-smoke
```

Error lines in the logs from deliberate failure-injection tests (invalid Stripe keys, forged
signatures, refused connections) are expected. During the smoke run, Stripe seat-sync failures
followed by an open circuit breaker are expected too: seeded subscriptions exist in no Stripe
account.

### Phase 7 — Fresh history (`HISTORY=fresh`)

1. The guardrail blocks `rm -rf .git`. Move it aside instead — it keeps the old history recoverable:

   ```bash
   mv .git ../<NEW_SLUG>.git.backup
   git init -b main
   pnpm exec husky          # re-installs the hooks; without it the pre-commit guard never runs
   git add -A
   git diff --cached --name-only | grep -E '^\.env'   # must print only .env.example
   git commit -m "chore: initial commit"
   ```

2. The pre-commit guard runs 22 steps including gitleaks and SonarQube (needs Docker). Never
   `--no-verify`. Confirm `git config core.hooksPath` prints `.husky/_` **before** committing — the
   first rename committed twice with no guard at all because the re-created `.git` had no hooks.
3. Later fixes are **amended into that commit** so the repo starts as one scratch commit. Verify:
   `git rev-list --all --count` prints `1` and the commit has 0 deleted lines.
4. **No remote until `PUBLISH=yes`.** An `origin` pointing at another product is fetched in the
   background and pulls its whole history in, so every diff shows the new tree "deleting" it. Keep
   the folder detached (`git remote remove origin`) until the destination is decided.

### Phase 8 — Publish (`PUBLISH=yes` only)

Only with the user's explicit answer to Phase 0. Never push over another product's `main`. If
replacing an existing `main` was agreed, pin the old tip first, then push with an explicit lease —
the guardrail blocks plain `--force`:

```bash
gh api repos/<NEW_REPO>/git/refs -f ref=refs/heads/legacy/main -f sha=<old-main-sha>
git push --force-with-lease=main:<old-main-sha> -u origin main
```

Verify with `git ls-remote origin refs/heads/main`. To undo a wrong push, point `main` back at the
old tip: `gh api -X PATCH repos/<NEW_REPO>/git/refs/heads/main -f sha=<old-main-sha> -F force=true`.

### Phase 9 — Report

End with: what was renamed (file count), every miss from Phase 5 and where each was fixed, gate
results with real numbers (`health` N/28, tests passed/failed/skipped per lane), what is still open
and why, the commit SHA and whether anything reached GitHub. Correct any number you reported
earlier if it turned out wrong.

---

## Already guarded — do not re-fix by hand

These misses were found by the first real rename and are now fixed **in the tooling**. Tests live in
`src/tests/unit/ci/project-identity.policy.unit.test.ts` unless noted; each was shown to fail with
its fix reverted.

| Miss                                                                                   | Fix                                                                                                | Guarded by                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Brand word hardcoded where the slug never appears (mail sender, OpenAPI description)   | `identityLiterals()` includes the display name and brand, brand matched as a whole word            | "flags the brand typed out as a word…"                            |
| User-facing placeholders (`YourApp`) in email sender and passkey prompt                | `project.brandName` → `PROJECT_BRAND_NAME` and the two `.env.example` lines                        | "writes the brand into the user-facing .env.example values…"      |
| Display name ending in `API` produced an `… API API` title                             | Documented: display name never ends in `API`                                                       | —                                                                 |
| `REDIS_KEY_PREFIX` value left behind while its comment was renamed                     | Rewrite rule for the value in `text-identity-rewrites.ts`                                          | Identity drift check                                              |
| Placeholder credentials turned into real-looking ones; restricted roles → superuser    | `rewritePreviousDatabaseName()`: only URL parts equal to the old database name change             | "prose pass renames only the URL parts…"                          |
| CI service `POSTGRES_USER` / `pg_isready` left on the old database                     | Same function also renames those settings                                                          | "prose pass keeps CI service settings in step…"                   |
| Uppercase hyphenated slug (`OLD-FE FULL JOURNEY` banner)                               | `slugSpellings()` covers every spelling                                                            | "lists every spelling a slug takes"                               |
| Genuine words renamed or flagged (`coreFeatures`, `CoreBehavior`)                      | `identityTokenPattern()` — whole identity tokens only, in the rename and the gate                  | "renames the slug inside identifiers but leaves genuine words…"   |
| Previous identity never checked; a leftover owner survived in docs                     | `previousNames` / `previousOwners` gate; `pnpm health` runs the identity check                     | "previous identity gate" suite                                    |
| A failed generation stranded the rename (re-run saw old == new)                        | `init:project` restores the manifest when generation fails                                         | —                                                                 |
| Worker could never boot: pool 20 vs demand 47; max connections 100 vs Compose's 500    | Template `DATABASE_POOL_MAX=60`, `POSTGRES_MAX_CONNECTIONS` unset (read live)                      | `worker-pool-budget.policy.unit.test.ts`                          |
| API smoke test called a removed route (`GET /tenancy/organizations`)                   | Smoke setup lists organizations from `/users/me/organizations`                                     | `pnpm test:api-smoke`                                             |

## Lessons that apply to any new miss

- **A green gate is not proof.** Gates check what they were told about. The word-by-word diff (5e)
  and the both-directions counts (5b) are the proof.
- **Check your search tool before trusting a zero.** `\b` in `git grep -E` matches nothing.
- **Look at the destination before pushing.** A repo with the new name may be someone's live product.
- **Hooks do not survive a new `.git`.** Re-install them and confirm the guard actually ran.
- **Fix the class, not the instance.** Patch the tooling, add a test, revert the fix once to watch the
  test fail, then restore it.
- **Check both directions.** Under-renaming leaves the old brand; over-renaming turns placeholders
  into credentials and ordinary words into the product.

## Related

- [adopting-as-template.md](adopting-as-template.md) — what `pnpm init:project` covers, flags, the
  identity gate
- [../deployment/runbooks/resource-limits.md](../deployment/runbooks/resource-limits.md) — connection
  budget and worker pool sizing
- `tooling/setup/init-project.ts` (the command), `tooling/setup/codegen/` (generator, rewrite rules,
  identity gate)
