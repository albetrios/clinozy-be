# Patients

Status: ready
Kind: screen
Depends on: team-and-access, shell-and-patterns
Tables: `patient` — [db-changes.md](../../db-changes.md)

## Stories

- As Front desk I want to register patients with their consent so that the clinic can treat and contact them.

## Rules

- Consent is three separate choices — data, photos, marketing (`operations.patients`)
- A phone is never identity (`data.contacts-on-records`)

## Acceptance criteria

- **patients.1** The patient list shows patient, mobile, last visit, doctor, dues and follow-up, with filters and a Recall view — intake-files/PRD.md:63
- **patients.2** New patient captures name, mobile, gender, DOB, address, type, consent and notes — intake-files/PRD.md:64
- **patients.3** Converting a lead creates the patient with the lead linked — intake-files/PRD.md:114

## Work items

- `data.stage-people`
- `operations.patients`
