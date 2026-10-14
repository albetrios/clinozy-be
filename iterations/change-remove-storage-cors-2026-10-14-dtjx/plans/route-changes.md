# change-remove-storage-cors-2026-10-14-dtjx — route changes

No route is added, removed or renamed; no request, response, status, permission or idempotency
rule changes. One route's OpenAPI description loses the removed command's name ([RC1](decisions.md)).

| Route | Before | After |
| --- | --- | --- |
| `POST /api/v1/uploads` — `schema.description` | "… The browser sends the bytes straight to storage, so the bucket CORS must admit the web app origin (pnpm ops:storage:cors)." | "… The browser sends the bytes straight to storage, so the bucket CORS must admit the web app origin." |

Database changes: none. Background work: none.
