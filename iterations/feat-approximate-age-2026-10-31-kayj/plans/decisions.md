# feat-approximate-age-2026-10-31-kayj — decisions

Add-only. A changed mind is a new row that supersedes an old one. Kind: `RED` (answered by the
user), `AMBER` (safe default, still open), `SCOPE` (a scope decision during implementation).

The user's answers (2026-10-31, given to the orchestrating session): "Approximate date + flag" — a
typed age stores `date_of_birth` = the organization's today minus that many years and
`date_of_birth_is_approximate` = true (boolean, NOT NULL, default false); a real `date_of_birth` sets
the flag false; create/update take `age` as an alternative (both → 400); every response showing a
birth date also shows `age` (organization's time zone) and the flag; age filters on the contacts list
and on every patient/lead list that filters people; both repositories; branch `feat/approximate-age`;
straight through (no stop between steps); nothing on production.

| Question | Options | Decision | Date | Who | Kind |
| --- | --- | --- | --- | --- | --- |
| **AA1** — Baseline and intake mode | Baseline `none`, a `brief` from scratch · a Baseline | **Baseline `none`, Intake mode `brief`** — the requirement arrived as words; `BRIEF.md` written from it | 2026-10-31 | the user · Claude | RED |
| **AA2** — How an age is stored | a separate `age_years` + `age_recorded_on` · an approximate date + flag | **Approximate date + flag**: `date_of_birth` = organization's today − `age` years, `date_of_birth_is_approximate` = true (the user's answer) | 2026-10-31 | the user | RED |
| **AA3** — `age` range | 0–120 · 0–150 | **0–120, whole years** (the brief's sane range) | 2026-10-31 | the user · Claude | RED |
| **AA4** — Filter names | `age_min` / `age_max` · `age_from` / `age_to` | **`age_from` / `age_to`** (inclusive) — the repository's list ranges are all `<field>_from` / `<field>_to` (`created_from`, `follow_up_at_from`, `prescription_date_from`); no list uses `_min`/`_max`. The user's "e.g." allowed following the repository's naming | 2026-10-31 | Claude | AMBER |
| **AA5** — Which lists get the age filter | contacts only · contacts, patients, leads | **Contacts, patients and leads** (and the patients' and leads' exports, which share the list query) — the three lists that filter people; the others (appointments, invoices …) filter records, not people | 2026-10-31 | Claude | AMBER |
| **AA6** — 29 February | 28 February · 1 March | **28 February** in a non-leap year — `date − interval 'n years'` in Postgres does the same, so the stored date, the computed `age` and the filter agree | 2026-10-31 | Claude | AMBER |
| **AA7** — An index for the age filter | partial index `(organization_id, date_of_birth)` · none | **None** — the list already filters on the organization (RLS + `organization_id`); one clinic holds thousands of contacts, and the age bound is a cheap predicate on rows already read. Add one `CONCURRENTLY` if a clinic's contacts list slows | 2026-10-31 | Claude | AMBER |
| **AA8** — A typed age on the organization's today ahead of the database's UTC date (age 0 just after midnight IST) | clamp to the database's today · let the CHECK fail | **Clamp** — the approximate date is never after the database's `CURRENT_DATE` (`chk_contacts_date_of_birth_past`), so the write is never a 500 | 2026-10-31 | Claude | AMBER |
| **AA9** — The flag without a birth date | allowed · CHECK forbids it | **Forbidden**: `chk_contacts_date_of_birth_approximate` (`NOT date_of_birth_is_approximate OR date_of_birth IS NOT NULL`), added `NOT VALID` then validated | 2026-10-31 | Claude | AMBER |
| **AA10** — The frontend | built in clinozy-fe on the same branch · blocked | **Blocked in this session**: attaching `albetrios/clinozy-fe` was refused by the session's permission check, so this iteration is opened backend-only (no `--both`); the frontend's form, "34 y · approx." and list filters stay for a clinozy-fe iteration built on these routes | 2026-10-31 | Claude | AMBER |
| **AA11** — Route review, sub-domain 1 (contacts, patients, leads lists) | confirm · change | **Confirmed, final (rev 1)** — `plans/routes-final.md` § 1, under the user's straight-through answer | 2026-10-31 | the user (straight through) · Claude | RED |
| **AA12** — Approval of `KICKOFF.md` and `plans/` | approve · back to planning | **Approved** — the user chose straight through | 2026-10-31 | the user · Claude | RED |
| **AA13** — Seeds | give demo contacts approximate ages · leave the seeds | **Leave them** — no seed writes a birth date today (`seedContact` takes none), so every seeded contact reads `age: null`, flag false (the column default); the later Cresence backfill is the first data with approximate dates | 2026-10-31 | Claude | AMBER |
| **AA14** — Where a refused `age` is reported | `age` · `body.age` | **`body.age`** — the route's body schema refuses it first, as every other body field in the app routes (`body.contact_id`, `body.home_branch_id`) | 2026-10-31 | Claude | SCOPE |
| **AA15** — The rules factory's length | split the preview view out · raise the limit | **Split out** `previewContact` — the typed age's two hook lines pushed `createContactsRules` past Biome's `noExcessiveLinesPerFunction`; behaviour unchanged (the preview suite green) | 2026-10-31 | Claude | SCOPE |
