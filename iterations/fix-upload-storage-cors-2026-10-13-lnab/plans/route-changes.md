# fix-upload-storage-cors-2026-10-13-lnab — route changes

No route is added, removed or renamed; no status, permission or idempotency rule changes. One
response field is added ([UC8](decisions.md)).

| Route | Before | After |
| --- | --- | --- |
| `POST /api/v1/uploads` (200) | `{ id, upload_url, key, expires_at, upload_method, fields? }` — `fields` only when `upload_method` is `POST` | `{ id, upload_url, key, expires_at, upload_method, fields?, headers? }` — `headers` only when `upload_method` is `PUT`: the request headers the PUT must carry, because the URL signs them (`content-type`, `x-amz-server-side-encryption`) |

Database changes: none. Background work: none.
