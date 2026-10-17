# Launch checklist — clinozy-be

**Status (2026-10-17): No-go for paying clinics.** Production deploys run (Railway, from a tagged
release with a manual approval) and the clinic rooms are served by this API, but the items below
block a paid launch. This is the live list: tick an item in the PR that closes it. The dated files
in [`docs/reviews/`](../reviews/) stay point-in-time snapshots; the frontend's half of this list is
clinozy-fe's `docs/deployment/production-readiness.md`.

## Blockers

- [ ] **WhatsApp sending.** The messaging data model, templates and notices exist, but no Meta
      Cloud API client does: the send-message route stores messages as `queued` and nothing sends
      them. The launch iteration's `AS-BUILT.md` records row #139 as built, so that record needs
      correcting too. Needs a verified Meta Business account and approved templates (owner).
- [ ] **Charging clinics in ₹.** Billing is Stripe-only and the seeded plans are priced in USD.
      Decided 2026-10-17 (D1): Razorpay Subscriptions in ₹ with UPI AutoPay, behind the existing
      billing service. Needs the owner's Razorpay KYC and live keys.
- [ ] **A lapsed plan turns read-only after a grace period.** Decided 2026-10-17 (D3): 14 days of
      grace, then read-only; the owner and admins are never suspended and no data is deleted.
      Until it is built, a lapse is only logged (see Done).
- [ ] **Patient data in India.** `S3_REGION` defaults to `us-east-1`, and the Neon region is not
      recorded in this repository. Decided 2026-10-17 (D4): Mumbai (`ap-south-1`) for files and the
      database, before the first real clinic.
- [ ] **DPDP Act readiness** — core duties (notice, consent, security safeguards, breach
      notification, retention) apply from 2027-05-13: a retention schedule, a breach runbook,
      patient export and erasure on a clinic's request, and a data-processing agreement with each
      clinic (drafted here, approved by a lawyer).
- [ ] **GST sign-off.** Per-branch GSTIN and financial-year invoice numbers are built
      ([worked examples](../reviews/gst-worked-examples-2026-10-09.md)); a chartered accountant
      has not yet signed off sample invoices that mix exempt treatment with 18% cosmetic lines.
- [ ] **Open frontend requests** — issue #34: 120 requests, 79 covered, 40 partial, 1 conflict
      (the Tasks "Everyone" view).
- [ ] **Restore drills proven.** The weekly smoke and monthly RTO drills
      ([restore-drill.md](restore-drill.md)) had three bugs, all fixed on `main`, but no drill has
      passed since. They run in the `production` GitHub Environment, so each run waits for a
      reviewer's approval — approve every run until a drill-only environment exists (decided
      2026-10-17; planned with alerting).
- [ ] **Alerting and on-call.** Sentry alert rules are documented but not applied as code, and
      nothing checks that the API, the worker and the scheduled jobs are alive; nobody is named to
      be paged.
- [ ] **The 2026-09-24 review's open items** —
      [production-readiness-2026-09-24.md](../reviews/production-readiness-2026-09-24.md).

## Done

- [x] **Nightly quality canary green** (2026-10-17) — `validate:constants` and
      `validate:domain:unit-matrix` failed on `main` since 2026-10-14 (#72); both now also run on
      every PR (`pr-ci.yml`).
- [x] **No staff lock-out on a lapsed plan** (2026-10-17) — a lapsed entitlement no longer
      suspends members: the Stripe-event path logs `billing.entitlement_lost`, the hourly
      seat-reconcile job logs `subscription-seat-reconcile.entitlement_lapsed`. The Free plan's
      single seat had suspended every non-owner member.

## Owner actions that don't wait on code

- Run both restore drills once on `main` (Actions → the weekly restore smoke and monthly restore
  RTO workflows → Run workflow) and approve the `production` step.
- Start Meta Business verification, Razorpay KYC and the custom domain.
- Name the chartered accountant and the lawyer who review the GST samples and the privacy drafts,
  and 3–5 pilot clinics.

## Go / no-go

**No-go** until every blocker above is ticked. Then run the
[production go-live runbook](runbooks/production-go-live.md), which includes the
path-to-production gate.
