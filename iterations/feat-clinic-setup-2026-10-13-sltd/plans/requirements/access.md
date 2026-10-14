# Access — feat-clinic-setup-2026-10-13-sltd

| Id | Requirement | Kind | Source |
| --- | --- | --- | --- |
| `access.setup-managers-only` | Only members holding `organization:update` (Owner, Admin) read or change a clinic's setup; everyone else gets `403`. | NEW | D19; OS4; BRIEF.md:217–219 |
| `access.setup-team-only` | A personal workspace never has a setup: the setup routes answer `422 team_organization_required` there. | NEW | OS4; BRIEF.md:239 |
| `access.writes-keep-own-gates` | Every record a setup step creates keeps its own gate on its own built route (`branch:create`, `offering:create`, `membership:create`, `membership:update`, `organization:update`); setup grants nothing. | NEW | routes-final §2.4 |
| `access.owner-extra-role` | The owner may add Doctor or Therapist as an extra role to their own membership; their main role stays Owner (as built, launch D81 (4)). | NEW (relied on) | D15; BRIEF.md:225–226 |

## Before → after

none — every requirement here is NEW (`access.owner-extra-role` is built behaviour this iteration relies on).
