# Seeded fixtures (`pnpm db:seed:full`)

The **full** seed (`src/scripts/seed/full.ts`) runs the reference seed (permissions, plans) and adds a
demo user, a demo organization and the common tenancy flows, for local exploration and the API smoke
test. It creates no subscriptions, notifications, webhooks or audit rows — those come from using the
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

## Tenancy flows

- **Second organization** — a generated organization owned by the demo user, with a `Member` role and
  one generated member.
- **Pending invitation** — an `INVITED` membership in the demo organization for a generated invitee,
  with a member invitation that expires in 7 days.

## Plans

- **Plans** — the reference catalog (`plan.reference.seed.ts`).

## Commands

```bash
pnpm compose:up && pnpm compose:wait
pnpm db:migrate
pnpm db:seed:full
pnpm dev
```

For the minimal reference data only (permissions + plans), use `pnpm db:seed`.
