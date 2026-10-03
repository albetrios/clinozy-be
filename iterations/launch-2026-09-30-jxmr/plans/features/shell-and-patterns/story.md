# Shell, lists and record rules

Status: ready
Kind: screen
Depends on: team-and-access
Tables: `user_preference`, `saved_view` — [db-changes.md](../../db-changes.md)

## Stories

- As a staff member I want my pinned sections, branch filter, recent picks and saved views on any device so that I work the same way everywhere.
- As a staff member I want every list to search, filter, sort and count so that I find records fast.
- As a staff member I want deletes to ask why and be undoable, and failed saves to keep my input, so that mistakes are cheap.

## Rules

- Every save is confirmed by the server; a stale save is refused with who and when (`operations.safe-saves`)
- Deleted records are purged after the clinic's window (`data.deleted-record-purge`)
- No clinic sees another clinic's records (`quality.tenant-isolation`)
- Every create and money action records once on retry (`quality.safe-retry`)

## Acceptance criteria

- **shell-and-patterns.1** Pinned sections, the branch filter and recent picks follow the user to any device — intake-files/PRD.md:180
- **shell-and-patterns.2** The command search finds patients, leads and invoices by name, phone or number — intake-files/PRD.md:180
- **shell-and-patterns.3** Every list searches, filters (its columns, Created, Follow-up), sorts, pages and shows its total — intake-files/PRD.md:235
- **shell-and-patterns.4** Delete, cancel and void ask for a reason and can be undone; deleted records are erased after the purge window — intake-files/PRD.md:234
- **shell-and-patterns.5** A failed save keeps the input, retrying never duplicates, and a stale save says who changed the record and when — intake-files/PRD.md:233

## Work items

- `data.organization-scope`
- `data.branch-scope`
- `data.common-fields`
- `data.display-numbers`
- `data.formats`
- `data.value-lists`
- `data.deleted-record-purge`
- `operations.lists`
- `operations.safe-saves`
- `operations.delete-restore`
- `operations.preferences`
- `operations.search`
- `realtime.refresh-60s`
- `quality.tenant-isolation`
- `quality.safe-retry`
- `quality.limits`
- `quality.retention`
- `files.exports`
- `background.retries`
- `background.run-once`
- `background.clinic-local-time`
- `background.deleted-record-purge`
