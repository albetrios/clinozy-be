# Flow 1 — an enquiry becomes a patient

Status: ready
Kind: flow
Depends on: leads-and-messages, appointments, today-floor, patients

## Stories

- As Front desk I want an enquiry to become a booked, checked-in patient without retyping so that the first visit is smooth.

## Rules

- Check-in moves the lead to Clinic visited (`operations.leads`)

## Acceptance criteria

- **flow-enquiry-to-patient.1** A new lead is booked from its chat, checked in on the day (the lead moves to Clinic visited), becomes a patient, and the visit completes — intake-files/PRD.md:111–114

## Work items

- `operations.leads`
- `operations.appointments`
- `operations.today-floor`
- `operations.patients`
