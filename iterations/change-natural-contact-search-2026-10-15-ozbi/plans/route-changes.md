# change-natural-contact-search-2026-10-15-ozbi — route changes

No route is added, removed or renamed; no parameter, request, response, status, permission or
idempotency rule changes. What `q` matches widens on four routes ([NS1](decisions.md),
[NS5](decisions.md)).

| Route | `q` before | `q` after |
| --- | --- | --- |
| `GET /api/v1/app/contacts` | the whole text, as one phrase, in the contact's search text; a number alone as its digits | every word of the text, in any order, each anywhere in the search text; number runs inside the text read as digits ([NS6](decisions.md)); the best match ranks the whole text, then the first word ([NS7](decisions.md)) |
| `GET /api/v1/app/leads` | the lead's contact's search text holds the whole text | holds every word of it |
| `GET /api/v1/app/appointments` | the appointment's contact's search text holds the whole text | holds every word of it (the service match is unchanged) |
| `GET /api/v1/app/patients` | the patient's contact's search text holds the whole text | holds every word of it |

A one-word `q`, a number, `C-n`, `#n` and `PT-n` read as before. The OpenAPI descriptions of the
four routes say "every word".

Database changes: none (the trigram index on `app.contacts.search_text` serves each word). Background
work: none.
