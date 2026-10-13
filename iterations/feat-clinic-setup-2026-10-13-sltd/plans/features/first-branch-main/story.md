Status: ready
Kind: screen
Depends on: none

## Stories
- As a clinic owner I want my first branch to be my main branch without thinking about it, so that patients, bills and
  one-branch screens have a home from day one.

## Rules
- A clinic's first branch is main whatever the request says; an explicit second main is still refused (`data.first-branch-main`, `operations.first-branch-main`).
- Two first branches at once leave exactly one main, with no error for the request that did not ask for main (`operations.first-branch-main`).

## Acceptance criteria
- A clinic's first branch becomes main even when the request does not say so — intake-files/BRIEF.md:277
- After step 2 the clinic has exactly one open main branch; repeating the step creates no second branch — intake-files/BRIEF.md:259–260

## Work items
- `data.first-branch-main`, `operations.first-branch-main`
