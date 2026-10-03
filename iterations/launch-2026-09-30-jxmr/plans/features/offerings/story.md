# Offerings and offers

Status: ready
Kind: screen
Depends on: team-and-access
Tables: `offering_group`, `offering`, `offer` — [db-changes.md](../../db-changes.md)

## Stories

- As a Counsellor or Admin I want to keep offerings, packages and offers with their prices so that bills and plans use the right price.

## Rules

- A discount never goes below the lowest price (`access.discounts`)
- Consultations default to 0% GST, procedures to 18% (`operations.offerings`)

## Acceptance criteria

- **offerings.1** Offerings, packages and offers carry kind, group, sessions, list price and lowest price — intake-files/PRD.md:99
- **offerings.2** A discount stops at the offer price without "Bill below the offer price" and never goes below the lowest price — intake-files/PRD.md:99
- **offerings.3** Offers apply to chosen branches or all, with optional dates — intake-files/PRD.md:100

## Work items

- `data.stage-catalogue`
- `operations.offerings`
- `access.discounts`
