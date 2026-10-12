# Frontend integration prompt — launch-2026-09-30-jxmr

The prompt to give clinozy-fe's agent so it wires the screens to the built API. Copy everything inside
the fence below into a session opened in the clinozy-fe repository. The prompt points at
[frontend-route-map.md](frontend-route-map.md) in this folder; keep that map current with
`pnpm iteration:frontend-map launch-2026-09-30-jxmr` before you hand it over.

```text
Integrate clinozy-fe with the clinozy-be API for the launch iteration launch-2026-09-30-jxmr.

CONTEXT
- The screens were built from the design drop (intake-files/schema-routes.md: 104 named operations,
  camelCase fields, money in paise, uuids). The backend is now built, and its API differs from that
  plan in places. Replace every mocked or planned call with the real API, and remove the design
  features the backend dropped.
- The contract, in this order of authority:
  1. The built API — the OpenAPI document: <API_BASE_URL>/reference/openapi.json on a running
     backend, or `pnpm docs:generate` in clinozy-be (docs/openapi/openapi.json).
  2. The route map: clinozy-be, branch feat/clinic-launch-api (main once merged),
     iterations/launch-2026-09-30-jxmr/plans/frontend-route-map.md. If you cannot read that
     repository, ask me to attach the file.
  3. Field-level differences: the same folder's ../AS-BUILT.md › "Standing deviations".
  Where the map and the OpenAPI document disagree, the OpenAPI document wins — and report the
  difference to me.
- Your own repository's conventions (CLAUDE.md, the agent-os `fe-` skills and rules, the iteration
  process for launch-2026-09-30-jxmr) decide how the frontend code is written. This prompt says what
  to integrate, not how your code is organised.

READ FIRST
- The route map, all four sections:
  1. What changes on every call — the organization comes from the token (resolve the slug with
     GET /tenancy/organizations/by-slug/:slug, then POST /auth/switch-to-organization); snake_case;
     public ids; rupees as decimals; pagination with limit/after and meta.pagination; explicit
     date-range filters; X-Idempotency-Key on the writes marked req (one key per user action, reused on
     a retry of the same request); DELETE with ?reason=&note= and
     POST …/restore; expected_updated_at with 409 record_changed; the error envelope
     { error: { type, code, reason, detail, errors[{ field, message }] } }; permission codes from
     GET /auth/me/context.
  2. Each design operation → its route, screen by screen.
  3. Every available route (method, path, gate, idempotency, team-only, summary).
  4. The design features dropped — remove these from the frontend.

PLAN FIRST — NO CODE
Write a plan before changing any code and show it to me:
- The API foundation: base URL and the /api/v1 prefix; sign-in (POST /auth/login, the MFA challenge
  through POST /auth/mfa/login), the access token, refresh (POST /auth/refresh with the session cookie
  and X-CSRF-Token), sign-out; the organization switch; one X-Idempotency-Key per user action, reused when that request is
  retried (the server replays its first answer; the same key with a different body is refused);
  one error mapper (validation errors[].field → form fields, 409 reasons → the right toast, 401 →
  refresh then sign-in, 403 → "no access"); one pagination helper; types generated from the OpenAPI
  document rather than written by hand.
- Where field names and money convert: at the API boundary only, by your repository's convention.
  Paise ↔ rupees conversions in the screens go away.
- The person model: one contact (/app/contacts) holds the person; leads, patient files, appointments,
  invoices, payments and medical sales point at it with contact_id. Creating a lead or a patient file
  can create its contact in the same call.
- For each screen (Today, Leads, Appointments, Patients and the patient file, Medical, Clinic stock,
  Payments and invoices, Tasks, Offerings, Users, sign-in and the shell): each operation in section 2,
  the route it moves to, and what changes in the screen.
- For each item in section 4: what you remove and where.
- Open questions: anything the map, the OpenAPI document and the screens do not settle.

THEN BUILD — ONE SCREEN AT A TIME
- The foundation first, then the screens in the order above.
- For each screen: wire every operation, remove its dropped features, gate actions by permission
  codes, show the server's validation messages on their fields, and handle the loading, empty and
  error states.
- Never invent an endpoint, a field or a value. If the screen needs something the API does not have,
  stop and list it for me — do not work around it on the client.
- Do not compute what the server computes: invoice totals, GST, due amounts, payment status, slots,
  the patient's ideas, the stock balance.

VERIFY
- Run each screen against a running backend (the clinozy-be live stack or the development
  deployment): sign in, pick the organization and a branch, then go through the screen's main flow
  and its errors (a stale save, a slot taken, a closed day, no permission).
- Add or update your tests by your repository's conventions; check the API types against the OpenAPI
  document.

REPORT BACK, PER SCREEN
- The operations wired, and the route each uses.
- The features removed (section 4).
- Every mismatch between the map, the OpenAPI document and the backend's actual behaviour — with the
  request and the response — so the backend or the map is fixed rather than patched around.
- Open questions and anything left undone.
```
