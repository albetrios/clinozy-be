Status: ready
Kind: flow
Depends on: first-branch-main, onboarding-setup

## Stories
- As a new clinic owner I want to answer three things and book my first patient within a minute or two of signing up.

## Rules
- The owner's extra role and hours (`access.owner-extra-role`); every created record keeps its own gate (`access.writes-keep-own-gates`).

## Acceptance criteria
- Answering "Yes, as a doctor" in step 3 makes the owner bookable at the main branch, with the branch's hours — intake-files/BRIEF.md:261–262
- "Go live" leaves one Consultation per chosen specialty and marks setup complete; the first booking can be saved — intake-files/BRIEF.md:263–264

## Work items
- `access.owner-extra-role`, `operations.go-live`, `data.first-branch-main`
