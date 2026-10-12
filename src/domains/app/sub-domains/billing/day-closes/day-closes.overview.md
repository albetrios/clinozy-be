`src/domains/app/sub-domains/billing/day-closes/`

# Day close

Parent: [billing](../billing.overview.md)

## Purpose

One branch's day of cash — opening, expected and counted — and what happened to it (launch
ROUTE #136 — routes-final 8.E, B25–B27). Tables `app.day_closes` and `app.day_close_events`.
Closing locks the day's money (B6); the auto-close worker (WC-39) closes the days nobody closed.

## Layout

| File | Role |
| --- | --- |
| `day-closes.schema.ts` | the two tables: one row per branch and day, closed exactly when the close's fields are set, the generated difference, RLS (with the sweep's read arm) |
| `day-closes.constants.ts` | statuses, opening sources, close kinds, event kinds, the backdate limit |
| `day-closes.rules.ts` | the carried opening, the expected cash at close, the reason check, reopen, the events, a page's live figures |
| `day-closes.repository.ts` | the shared reads and writes, the day's live money, the close's `FOR UPDATE` |
| `day-close-auto-close.repository.ts` | the auto-close worker's reads and writes on its pinned handle |
| `day-closes.{dto,validator,serializer,types}.ts` | request shapes, the response with figures and events |
| `day-closes.service.ts` / `.controller.ts` / `.routes.ts` | routes 28–32 |
| `queues/` · `workers/` | WC-39: the hourly sweep (`day-close-auto-close-sweep`) and the per-organization job (`day-close-auto-close`) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/day-closes` | `payment:read` |
| `POST /app/day-closes` | `payment:update` |
| `GET /app/day-closes/{day_close_id}` | `payment:read` |
| `POST /app/day-closes/{day_close_id}/close` | `payment:update` — whoever counts the drawer: Front desk, Counsellor, Accountant, Owner, Admin (launch D83 (2), the deliberate rule) |
| `POST /app/day-closes/{day_close_id}/reopen` | `payment:delete` — Owner, Admin, Accountant (launch D83 (2)) |

## Key invariants

- **Expected cash (B25):** the opening plus the cash received less the cash paid in the day's live
  payments; a count that differs needs a reason.
- **Never changed or deleted:** opened, closed, reopened — each step an event (B27). An event's
  `text` is an English log line with that moment's figures (a reopen's: the reason as typed); a
  client renders by `kind` and the day's figures (D81 PAY-M4).
- **Auto close (B26):** a day still open at the end of the day after it closes with the count
  taken as expected (`close_kind = auto`); money on a day nobody opened opens it first.
