Status: ready
Kind: screen
Depends on: none

## Stories
- As the store keeper I want to receive what actually arrived so that stock and batches are true.
- As the owner I want to owe only what arrived and see which lines came short.

## Rules
- Received quantities default to ordered; 0…ordered (`operations.receive-what-arrived`).
- Amounts on received × rate (`quality.one-money-calculation`).

## Acceptance criteria
- A-1 – A-7 — intake-files/BRIEF.md:52–58

## Work items
- `data.received-quantities`, `data.received-backfill`, `operations.receive-what-arrived`, `operations.short-lines-shown`, `quality.one-money-calculation`
