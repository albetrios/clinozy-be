Status: ready
Kind: flow
Depends on: none

## Stories

- As a clinic owner opening Clinozy for the first time, I want the sign-in screen to tell me what the product does, so that I know I am in the right place before I sign in.
- As a front-desk member, I want room switches that do not flicker and tabs that do not move, so that the app feels steady through a busy day.
- As anyone filtering or picking a value, I want a picked badge to look picked in its own colour, not outlined in black.
- As the frontend, I want every route I call to stay exactly as it is, so that this change ships without a backend release.

## Rules

- No backend route, table, job, seed or permission changes (`data.none`, `quality.contract-unchanged`).
- The marketing copy is static frontend copy; the backend serves none of it (D6).

## Acceptance criteria

- `docs/routes.txt` and the OpenAPI document are unchanged — intake-files/BRIEF.md:53
- The frontend's contract-drift check passes against this branch's route catalog — intake-files/BRIEF.md:57
- The backend's gates pass — intake-files/BRIEF.md:84
- The frontend's acceptance criteria 1–10 are proved in the frontend iteration — intake-files/BRIEF.md:68

## Work items

- `data.none`
- `quality.contract-unchanged`
