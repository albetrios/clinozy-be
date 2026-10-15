# Seeded fixtures (`pnpm db:seed:full`)

The **full** seed (`src/scripts/seed/full.ts`) runs the reference seed (permissions, plans) and adds:

- a demo user, a demo organization and the common tenancy flows, for local exploration and the API
  smoke test;
- the **demo clinic** (below), for working in the app with real-looking records.

It creates no subscriptions, notifications, webhooks or audit rows — those come from using the
API (or from `pnpm db:seed:bulk`).

## Credentials

| Field | Value |
| ----- | ----- |
| Email | `demo@example.com` |
| Password | `DEMO_PASSWORD` (8+ characters). Unset → a random password that is never printed, so set it to log in |

The API smoke test (`pnpm test:api-smoke`) and the k6 auth scenario read the same `DEMO_EMAIL` /
`DEMO_PASSWORD` and default to `demo@example.com` / `DemoPassword123!` — seed with
`DEMO_PASSWORD=DemoPassword123! pnpm db:seed:full` to match them.

## Demo organization

| Field | Value |
| ----- | ----- |
| Name | Demo Organization |
| Slug | `demo-org` |
| Role | Admin (every system permission) |

Use its id (`org_…`, in the seed log) with `POST /auth/switch-to-organization`.

## Demo clinic

`pnpm db:seed:demo-clinic` (also run by `db:seed:full`) seeds one skin & hair clinic that looks like
a real one. The seed log prints its name, slug and the staff's emails. Every value looks real except
the emails, which stay on `example.com`.

| What | Seeded |
| ---- | ------ |
| Clinic | A clinic name, two branches in one Indian city (real areas, PIN codes, landlines, one GSTIN), rooms and lasers, an 11-item price list. The main branch has a Google review link (`https://g.page/r/CQdemoclinicEAE/review`, a made-up place code) for the review ask; the second has none |
| Staff | Owner (also a Doctor), Doctor, two Therapists, Front desk. All can sign in with an email code; onboarding is done, and the clinic setup is complete, so nobody meets the setup drawer |
| `demo@example.com` | Admin in the clinic and member of both branches (when the user exists) |
| Patients | 24, with first consultations and their notes, treatment sessions every two to four weeks, check-ins and reviews |
| Today | Both branches have patients done, at checkout, with the doctor, waiting, confirmed and booked. The main branch also has one in treatment and a cancellation; the second has a no-show |
| Money | Bills paid by UPI, card or cash; three part-paid; today's checkout visits unpaid |
| Enquiries | 12 leads with WhatsApp threads: three new and unanswered, the rest contacted, following up, gone quiet, lost or converted |
| Tasks | The app's own task rules, run once by the seed (aftercare calls, replies, arrivals, dues, rebookings, next visits), plus past aftercare calls and the demo user's own to-dos |

- **Same clinic every time:** a `SEED` (default 12345) always gives the same clinic. A re-run keeps it.
- **Rebuild:** `pnpm db:seed:demo-clinic --fresh` deletes the clinic and seeds it again around today,
  so Today stays current. It runs only against a local database.

## Tenancy flows

- **Second organization** — a generated organization owned by the demo user, with a `Member` role and
  one generated member.
- **Pending invitation** — an `invited` membership in the demo organization for a generated invitee,
  with a membership invitation that expires in 7 days.

## Plans

- **Plans** — the reference catalog (`plan.reference.seed.ts`).

## Commands

```bash
pnpm compose:up && pnpm compose:wait
pnpm db:migrate
pnpm setup:local --only-env   # turn on the database logins the migrations created
pnpm db:seed:full
pnpm dev
```

For the minimal reference data only (permissions + plans), use `pnpm db:seed`.
