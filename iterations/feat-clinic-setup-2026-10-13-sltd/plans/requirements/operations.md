# Operations — feat-clinic-setup-2026-10-13-sltd

| Id | Requirement | Kind | Source |
| --- | --- | --- | --- |
| `operations.read-setup` | A manager reads the clinic's setup in one call: answered steps, skips, the main branch, the next step, the three live checks, whether it is live, whether someone can be booked, the three guide items with done / skipped / skippable, the guide's count, and the times. | NEW | OS1, OS3; routes-final §2.A.6 |
| `operations.change-setup` | A manager answers a step, skips or un-skips a guide item, chooses "Explore first", or hides and reopens the guide; changes merge with others made at the same time. | NEW | OS5; BRIEF.md:51–52, 111–112 |
| `operations.go-live` | A manager takes the clinic live; the server refuses while the clinic type, the main branch or a service is missing and names what is missing; going live twice changes nothing. | NEW | OS6; BRIEF.md:222–224, 276 |
| `operations.guide-items` | The guide's three items, in order: `treatments` (≥ 2 active services, skippable), `invite_team` (another member, invited or active, skippable), `first_appointment` (any appointment, never skipped). | NEW | D28; routes-final §2.A.10 |
| `operations.guide-done-once` | The first read that finds all three guide items done or skipped records it; the record never resets. | NEW | D20; OS7 |
| `operations.first-branch-main` | Creating a branch in a clinic with no main branch makes it main, whatever the request says; an explicit second main stays refused. | CHANGED | BR1–BR3 |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.first-branch-main` | `POST /branches` without `is_main` creates a non-main branch, even the clinic's first | the first branch is main; later ones as sent; a race leaves one main with no error for the request that did not ask | BR1–BR3 |
